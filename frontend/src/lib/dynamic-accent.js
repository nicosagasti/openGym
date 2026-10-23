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
//
// The colours are the user's to pick (S.dynamicColors = { start, end, rest }, each '#rrggbb' or
// absent). A ramp between their start and end goes round the colour wheel (hueRamp), the way the
// built-in one does from red to green; with neither picked it is the built-in ramp itself.
import { todayISO } from './format.js'
import { effectiveRoutines, setsDoneActive, setUnitsTotal } from './history.js'
import { DYNAMIC, accentKey, accentValue, cleanHex } from './accent.js'

// Warm and bright all the way: red → orange → amber → lime → the app's green. Mixing red and
// green directly passes through a muddy brown; neighbouring stops this close never do.
export const DYNAMIC_STOPS = ['#ff5a5f', '#ff9f43', '#ffc145', '#a8d84e', '#30d158']
export const REST_COLOR = '#6e9cff'

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const toHex = c => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

// HSL, so a ramp can travel round the wheel instead of through the grey middle of a straight mix.
function toHsl(hex) {
  const [r, g, b] = rgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}
function fromHsl([h, s, l]) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex([r, g, b].map(v => (v + m) * 255))
}
// Below this saturation a colour has no hue worth keeping (a grey, white, black).
const GREYISH = 0.08

/**
 * `n` colours from `from` to `to` (both '#rrggbb', both included), round the colour wheel the
 * short way with saturation and lightness moving evenly: red to green passes yellow, not brown.
 * A grey end has no hue of its own and takes the other end's, so the ramp does not swing
 * through red on the way.
 */
export function hueRamp(from, to, n) {
  const a = toHsl(from), b = toHsl(to)
  if (a[1] < GREYISH) a[0] = b[0]
  if (b[1] < GREYISH) b[0] = a[0]
  const dh = ((b[0] - a[0] + 540) % 360) - 180
  return Array.from({ length: n }, (_, k) => {
    if (k === 0) return from
    if (k === n - 1) return to
    const f = k / (n - 1)
    return fromHsl([a[0] + dh * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f])
  })
}

const ownColors = S => (S?.dynamicColors && typeof S.dynamicColors === 'object' ? S.dynamicColors : {})

/** The ramp for `S`: the built-in one, or one from the user's start to their end. */
export function dynamicStops(S) {
  const own = ownColors(S)
  const start = cleanHex(own.start), end = cleanHex(own.end)
  if (!start && !end) return DYNAMIC_STOPS
  return hueRamp(start || DYNAMIC_STOPS[0], end || DYNAMIC_STOPS.at(-1), DYNAMIC_STOPS.length)
}

/** The rest-day colour for `S`: the user's, or the built-in blue. */
export const restColorOf = S => cleanHex(ownColors(S).rest) || REST_COLOR

/** The colour `p` (0–1) of the way along `stops`. */
export function progressColor(p, stops = DYNAMIC_STOPS) {
  const x = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
  const n = stops.length - 1
  const i = Math.min(n - 1, Math.floor(x * n))
  const f = x * n - i
  if (f <= 0) return stops[i]
  if (f >= 1) return stops[i + 1]
  const a = rgb(stops[i]), b = rgb(stops[i + 1])
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
  const stops = dynamicStops(S)
  const p = sessionProgress(S?.active)
  if (p !== null) return progressColor(p, stops)
  if ((S?.workouts || []).some(w => w.d === today)) return stops.at(-1)
  const trainingDay = effectiveRoutines(S, today).some(r => (r.ex || []).length)
  return trainingDay ? stops[0] : restColorOf(S)
}

/** accentValue (lib/accent.js) with the dynamic choice drawn as today's colour of it. */
export const liveAccentValue = S => accentKey(S) === DYNAMIC ? dynamicAccent(S) : accentValue(S)
