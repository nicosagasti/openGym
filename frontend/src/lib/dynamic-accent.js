// The "Dynamic" accent (Settings → Accent color): a colour that says how today is going.
//
//   a training day not trained yet   → coral red, the first stop
//   a session in progress            → along the stops by the share of its sets done
//   a workout logged today           → the final green
//   a rest day                       → a soft blue of its own, so resting never reads as behind
//
// A session in progress wins over the rest: a rest day trained anyway, and a second session on a
// day already trained, follow their own sets. A saved workout open in the editor, or a backfill,
// is not a session in progress. The result is a plain '#rrggbb' that lib/accent.js draws like a
// colour of the user's own, so it gets the same light/dark readability adjustment.
import { todayISO } from './format.js'
import { effectiveRoutines, setsDoneActive, setUnitsTotal } from './history.js'
import { DYNAMIC, accentKey, accentValue } from './accent.js'

// Warm and bright all the way: red → orange → amber → lime → the app's green. Mixing red and
// green directly passes through a muddy brown; neighbouring stops this close never do.
export const DYNAMIC_STOPS = ['#ff5a5f', '#ff9f43', '#ffc145', '#a8d84e', '#30d158']
export const REST_COLOR = '#6e9cff'

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const toHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

/** The colour `p` (0–1) of the way along the stops. */
export function progressColor(p) {
  const x = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
  const n = DYNAMIC_STOPS.length - 1
  const i = Math.min(n - 1, Math.floor(x * n))
  const f = x * n - i
  if (f <= 0) return DYNAMIC_STOPS[i]
  if (f >= 1) return DYNAMIC_STOPS[i + 1]
  const a = rgb(DYNAMIC_STOPS[i]), b = rgb(DYNAMIC_STOPS[i + 1])
  return toHex(a.map((v, k) => v + (b[k] - v) * f))
}

/** Share (0–1) of a live session's sets that are done; null when there is no live session. */
export function sessionProgress(A) {
  if (!A || A.editingWorkoutId || A.backfill) return null
  const total = setUnitsTotal(A.entries)
  return total > 0 ? Math.min(1, setsDoneActive(A) / total) : 0
}

/** Today's colour for the dynamic accent. */
export function dynamicAccent(S, today = todayISO()) {
  const p = sessionProgress(S?.active)
  if (p !== null) return progressColor(p)
  if ((S?.workouts || []).some(w => w.d === today)) return DYNAMIC_STOPS.at(-1)
  const trainingDay = effectiveRoutines(S, today).some(r => (r.ex || []).length)
  return trainingDay ? DYNAMIC_STOPS[0] : REST_COLOR
}

/** accentValue (lib/accent.js) with the dynamic choice drawn as today's colour of it. */
export const liveAccentValue = S => accentKey(S) === DYNAMIC ? dynamicAccent(S) : accentValue(S)
