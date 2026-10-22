// Offering a finished session's shape back to the routine it came from.
//
// Finishing a workout never edits a routine (lib/session-routines.js): the routine is the plan,
// the session what was done with it. When the session's exercises differ from the plan in a way
// the next session should keep, the finish flow asks (sheets.jsx routineUpdateSheet) and these
// helpers say what differs and write it back, on an explicit choice only.
//
// What counts: an exercise added, left out or swapped for another, the order, the supersets, and
// the warm-ups, rest and note the exercise's ⋯ → Update routine already offered one at a time.
// What does not: weight, reps and the number of work sets — progression moves those every
// session, and the routine is the plan it reads them against.
import { routineSlotIndex, routineChangesFromEntry, copyRoutine } from './routines.js'
import { copiedEntry, groupIds } from './session-routines.js'

// The session's entries built from `routine`, in session order, each with the routine slot it
// fills (`at`), or -1 for one the routine never had: added in the session, or swapped in.
function viewOf(routine, entries) {
  const out = []
  ;(entries || []).forEach((entry, i) => {
    if (entry && entry.rid === routine.id) out.push({ i, entry, at: routineSlotIndex(routine, entries, i) })
  })
  return out
}

// Supersets as a comparable string: runs of neighbours sharing a non-empty `sg`, of two or more,
// written as the keys they hold. Only `keep`'s keys are counted, so an exercise that is new or
// gone (already reported as such) does not also read as a superset change.
function groupsOf(list, keep) {
  const groups = []
  let run = null
  for (const { key, sg } of list) {
    if (sg != null && sg !== '' && run && run.sg === sg) run.keys.push(key)
    else { run = { sg: sg != null && sg !== '' ? sg : null, keys: [key] }; groups.push(run) }
  }
  return groups
    .filter(g => g.sg != null)
    .map(g => g.keys.filter(k => keep.has(k)))
    .filter(keys => keys.length > 1)
    .map(keys => keys.sort((a, b) => a - b).join(','))
    .sort()
    .join('|')
}

/**
 * What the session changed in `routine`, or null when nothing the routine keeps differs:
 *   { routineId, name, add: [exId], remove: [exId], swap: [{ from, to }], order, supersets,
 *     setup: [{ id, changes }] }
 * `setup` holds lib/routines.js routineChangesFromEntry's changes for each kept exercise.
 * A session that kept none of the routine's exercises is not offered at all: that is a different
 * workout, and writing it back would empty or replace the routine wholesale.
 */
export function routineDiff(routine, entries) {
  if (!routine || !Array.isArray(routine.ex)) return null
  const view = viewOf(routine, entries)
  const kept = view.filter(v => v.at >= 0)
  if (!kept.length) return null
  const keptAt = new Set(kept.map(v => v.at))

  // Each slot or entry is placed after the last kept slot before it, so a removal and an addition
  // in the same place pair up as a swap. The routine side counts kept slots in routine order, the
  // session side the slot of the kept entry before it in session order.
  const removed = []
  let anchor = -1
  routine.ex.forEach((x, at) => { if (keptAt.has(at)) anchor = at; else removed.push({ id: x.id, anchor }) })
  const added = []
  anchor = -1
  for (const v of view) { if (v.at >= 0) anchor = v.at; else added.push({ id: v.entry.id, anchor }) }
  const swap = []
  for (const r of removed) {
    const k = added.findIndex(a => a.anchor === r.anchor && !a.paired)
    if (k >= 0) { added[k].paired = r.paired = true; swap.push({ from: r.id, to: added[k].id }) }
  }

  const ats = kept.map(v => v.at)
  const order = ats.some((at, k) => k > 0 && at < ats[k - 1])
  const supersets = groupsOf(view.map(v => ({ key: v.at, sg: v.entry.sg })), keptAt)
    !== groupsOf(routine.ex.map((x, at) => ({ key: at, sg: x.sg })), keptAt)
  const setup = kept
    .map(v => ({ id: v.entry.id, found: routineChangesFromEntry(routine, entries, v.i) }))
    .filter(x => x.found)
    .map(x => ({ id: x.id, changes: x.found.changes }))

  const diff = {
    routineId: routine.id, name: routine.name,
    add: added.filter(a => !a.paired).map(a => a.id),
    remove: removed.filter(r => !r.paired).map(r => r.id),
    swap, order, supersets, setup,
  }
  const any = diff.add.length || diff.remove.length || swap.length || order || supersets || setup.length
  return any ? diff : null
}

/** routineDiff for every routine the session was built from, in the order they first appear. */
export function sessionRoutineDiffs(routines, entries) {
  const ids = [...new Set((entries || []).map(e => e?.rid).filter(id => id != null))]
  return ids
    .map(id => (routines || []).find(r => r?.id === id))
    .filter(Boolean)
    .map(r => routineDiff(r, entries))
    .filter(Boolean)
}

/**
 * The routine's exercises as the session had them: its order, its supersets, the exercises it
 * added. A kept exercise keeps everything its slot says (progression rule, range, target) and
 * takes only the warm-ups, rest and note the session changed; a new one is copied from the
 * session the way Save as routine copies it. The routine itself is not touched.
 */
export function buildRoutineEx(routine, entries) {
  const ex = viewOf(routine, entries).map(v => {
    if (v.at < 0) return copiedEntry(v.entry, routine)
    const cfg = structuredClone(routine.ex[v.at])
    const found = routineChangesFromEntry(routine, entries, v.i)
    for (const { key, to } of found?.changes || []) {
      if (to) cfg[key] = to
      else delete cfg[key]
    }
    const sg = v.entry.sg
    if (sg != null && sg !== '') cfg.sg = sg
    else delete cfg.sg
    return cfg
  })
  return groupIds(ex)
}

/** Writes the session's shape into routine `routineId` on a store draft. False when it is gone. */
export function applySessionToRoutine(state, routineId, entries) {
  const routine = (state?.routines || []).find(r => r.id === routineId)
  if (!routine) return false
  const ex = buildRoutineEx(routine, entries)
  if (!ex.length) return false
  routine.ex = ex
  return true
}

/**
 * A new routine beside the original, with the session's shape and the original's own fields (its
 * progression rule, a deload flag), named the way Duplicate names one ("Push (Copy)", then
 * "Push (Copy 2)"; `suffix` is the translated word). Not put on any day: the week is left as it
 * is. Returns its id, or null when the original is gone.
 */
export function saveSessionAsNewRoutine(state, routineId, entries, suffix = 'Copy') {
  const routine = (state?.routines || []).find(r => r.id === routineId)
  if (!routine) return null
  const ex = buildRoutineEx(routine, entries)
  if (!ex.length) return null
  const copy = copyRoutine(routine, suffix)
  copy.ex = ex
  state.routines.push(copy)
  return copy.id
}
