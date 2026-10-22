import { describe, expect, it } from 'vitest'
import { routineDiff, sessionRoutineDiffs, buildRoutineEx, applySessionToRoutine, saveSessionAsNewRoutine } from './routine-sync.js'

// A routine slot, and the session entry a planned session builds from it (session-start.js keeps
// the slot's sg and stamps the routine on the entry as `rid`).
const slot = (id, extra = {}) => ({ id, sets: 3, reps: 8, weight: 50, ...extra })
const work = (n = 3) => Array.from({ length: n }, () => ({ r: 8, w: 50, done: true }))
const entry = (id, rid, extra = {}) => ({ id, rid, sets: work(), target: { sets: 3, reps: 8, weight: 50 }, ...extra })
const routine = (ex, extra = {}) => ({ id: 'r1', name: 'Push', ex, ...extra })

// Exercise ids that exist in the library, so defaultConfig and the cardio check have something real.
const BENCH = '0025', OHP = '0405', DIP = '0251', FLY = '0308', TRI = '0194'

describe('routineDiff', () => {
  it('is null when the session did what the routine says', () => {
    const r = routine([slot(BENCH), slot(OHP)])
    expect(routineDiff(r, [entry(BENCH, 'r1'), entry(OHP, 'r1')])).toBe(null)
  })
  it('ignores weight, reps and the number of work sets', () => {
    const r = routine([slot(BENCH)])
    const e = entry(BENCH, 'r1', { sets: [...work(4)].map(s => ({ ...s, w: 80, r: 3 })) })
    expect(routineDiff(r, [e])).toBe(null)
  })
  it('sees an exercise added to the session', () => {
    const d = routineDiff(routine([slot(BENCH)]), [entry(BENCH, 'r1'), entry(DIP, 'r1')])
    expect(d.add).toEqual([DIP])
    expect(d.remove).toEqual([])
  })
  it('sees an exercise left out of the session', () => {
    const d = routineDiff(routine([slot(BENCH), slot(FLY)]), [entry(BENCH, 'r1')])
    expect(d.remove).toEqual([FLY])
  })
  it('reads a removal and an addition in the same place as a swap', () => {
    const d = routineDiff(routine([slot(BENCH), slot(FLY), slot(OHP)]), [entry(BENCH, 'r1'), entry(DIP, 'r1'), entry(OHP, 'r1')])
    expect(d.swap).toEqual([{ from: FLY, to: DIP }])
    expect(d.add).toEqual([])
    expect(d.remove).toEqual([])
  })
  it('sees a new order', () => {
    const d = routineDiff(routine([slot(BENCH), slot(OHP)]), [entry(OHP, 'r1'), entry(BENCH, 'r1')])
    expect(d.order).toBe(true)
  })
  it('sees supersets made or broken in the session', () => {
    const r = routine([slot(BENCH), slot(OHP)])
    expect(routineDiff(r, [entry(BENCH, 'r1', { sg: 'x' }), entry(OHP, 'r1', { sg: 'x' })]).supersets).toBe(true)
    const paired = routine([slot(BENCH, { sg: 'a' }), slot(OHP, { sg: 'a' })])
    expect(routineDiff(paired, [entry(BENCH, 'r1', { sg: 'a' }), entry(OHP, 'r1', { sg: 'a' })])).toBe(null)
    expect(routineDiff(paired, [entry(BENCH, 'r1'), entry(OHP, 'r1')]).supersets).toBe(true)
  })
  it('carries the warm-up, rest and note changes the menu already offers', () => {
    const e = entry(BENCH, 'r1', { target: { sets: 3, reps: 8, restSec: 180 } })
    const d = routineDiff(routine([slot(BENCH, { restSec: 120 })]), [e])
    expect(d.setup).toEqual([{ id: BENCH, changes: [{ key: 'restSec', from: 120, to: 180 }] }])
  })
  it('only reads the entries of its own routine', () => {
    const d = routineDiff(routine([slot(BENCH)]), [entry(BENCH, 'r1'), entry(DIP, 'r2'), entry(TRI, undefined)])
    expect(d).toBe(null)
  })
  it('never offers to empty a routine', () => {
    expect(routineDiff(routine([slot(BENCH)]), [entry(DIP, 'r2')])).toBe(null)
  })
})

describe('sessionRoutineDiffs', () => {
  it('gives one diff per routine of the session that changed, in session order', () => {
    const routines = [routine([slot(BENCH)]), { id: 'r2', name: 'Legs', ex: [slot(DIP)] }]
    const entries = [entry(BENCH, 'r1'), entry(OHP, 'r1'), entry(DIP, 'r2')]
    const diffs = sessionRoutineDiffs(routines, entries)
    expect(diffs.map(d => d.routineId)).toEqual(['r1'])
  })
  it('skips a routine deleted since the session started', () => {
    expect(sessionRoutineDiffs([], [entry(BENCH, 'gone'), entry(OHP, 'gone')])).toEqual([])
  })
})

describe('buildRoutineEx', () => {
  it('keeps each kept exercise’s own setup and adds the new ones from the session', () => {
    const kept = slot(BENCH, { prog: 'double', repsMin: 6, reps: 10, weight: 60 })
    const ex = buildRoutineEx(routine([kept, slot(FLY)]), [entry(BENCH, 'r1'), entry(DIP, 'r1', { rid: 'r1' })])
    expect(ex.map(x => x.id)).toEqual([BENCH, DIP])
    expect(ex[0]).toMatchObject({ prog: 'double', repsMin: 6, reps: 10, weight: 60 })
    expect(ex[1].rid).toBeUndefined()
  })
  it('takes the session order and its supersets', () => {
    const ex = buildRoutineEx(routine([slot(BENCH), slot(OHP), slot(DIP)]),
      [entry(DIP, 'r1'), entry(BENCH, 'r1', { sg: 'x' }), entry(OHP, 'r1', { sg: 'x' })])
    expect(ex.map(x => x.id)).toEqual([DIP, BENCH, OHP])
    expect(ex[0].sg).toBeUndefined()
    expect(ex[1].sg).toBeTruthy()
    expect(ex[1].sg).toBe(ex[2].sg)
  })
  it('applies the warm-up, rest and note of the session to a kept exercise', () => {
    const e = entry(BENCH, 'r1', { target: { sets: 3, reps: 8, restSec: 180, note: 'Pausa' } })
    const [x] = buildRoutineEx(routine([slot(BENCH, { restSec: 120 })]), [e])
    expect(x).toMatchObject({ restSec: 180, note: 'Pausa' })
  })
  it('does not touch the routine it reads', () => {
    const r = routine([slot(BENCH)])
    const before = structuredClone(r)
    buildRoutineEx(r, [entry(OHP, 'r1'), entry(BENCH, 'r1', { target: { restSec: 30 } })])
    expect(r).toEqual(before)
  })
})

describe('applySessionToRoutine / saveSessionAsNewRoutine', () => {
  const state = () => ({ routines: [routine([slot(BENCH), slot(FLY)], { prog: 'double' })], week: { 1: ['r1'] } })
  const session = [entry(BENCH, 'r1'), entry(DIP, 'r1')]
  it('rewrites the routine in place and keeps its id, name and own fields', () => {
    const s = state()
    expect(applySessionToRoutine(s, 'r1', session)).toBe(true)
    expect(s.routines[0]).toMatchObject({ id: 'r1', name: 'Push', prog: 'double' })
    expect(s.routines[0].ex.map(x => x.id)).toEqual([BENCH, DIP])
  })
  it('does nothing for a routine that is gone', () => {
    const s = state()
    expect(applySessionToRoutine(s, 'nope', session)).toBe(false)
    expect(s.routines[0].ex.map(x => x.id)).toEqual([BENCH, FLY])
  })
  it('saves a copy beside the original and leaves the week alone', () => {
    const s = state()
    const id = saveSessionAsNewRoutine(s, 'r1', session, 'Copy')
    expect(s.routines).toHaveLength(2)
    expect(s.routines[0].ex.map(x => x.id)).toEqual([BENCH, FLY])
    const copy = s.routines.find(r => r.id === id)
    expect(copy).toMatchObject({ name: 'Push (Copy)', prog: 'double' })
    expect(copy.id).not.toBe('r1')
    expect(copy.ex.map(x => x.id)).toEqual([BENCH, DIP])
    expect(s.week).toEqual({ 1: ['r1'] })
  })
})
