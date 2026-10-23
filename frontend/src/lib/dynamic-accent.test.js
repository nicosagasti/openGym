import { describe, expect, it } from 'vitest'
import { DYNAMIC_STOPS, REST_COLOR, progressColor, sessionProgress, dynamicAccent, liveAccentValue, dynamicStops, restColorOf, hueRamp } from './dynamic-accent.js'
import { accentKey, accentValue, sanitizeAccent, DYNAMIC } from './accent.js'

const ISO = '2026-08-19'   // a Wednesday → getDay() 3
const routines = [{ id: 'r1', name: 'Push', ex: [{ id: '1' }] }]
const sets = (done, total) => Array.from({ length: total }, (_, i) => ({ r: 8, w: 50, done: i < done }))
const state = (o = {}) => ({ routines, week: { 3: ['r1'] }, dayPlan: {}, workouts: [], active: null, ...o })
const session = (done, total, extra = {}) => ({ entries: [{ id: '1', sets: sets(done, total) }], ...extra })

describe('progressColor', () => {
  it('starts on the first stop and ends on the last', () => {
    expect(progressColor(0)).toBe(DYNAMIC_STOPS[0])
    expect(progressColor(1)).toBe(DYNAMIC_STOPS.at(-1))
  })
  it('lands on each stop at its share of the way', () => {
    const n = DYNAMIC_STOPS.length - 1
    DYNAMIC_STOPS.forEach((c, i) => expect(progressColor(i / n)).toBe(c))
  })
  it('clamps anything outside 0–1, and treats nonsense as 0', () => {
    expect(progressColor(-1)).toBe(DYNAMIC_STOPS[0])
    expect(progressColor(2)).toBe(DYNAMIC_STOPS.at(-1))
    expect(progressColor(NaN)).toBe(DYNAMIC_STOPS[0])
  })
  it('gives a plain #rrggbb in between', () => {
    expect(progressColor(0.3)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('sessionProgress', () => {
  it('is null with no session, and for a saved workout open in the editor or a backfill', () => {
    expect(sessionProgress(null)).toBe(null)
    expect(sessionProgress(session(1, 4, { editingWorkoutId: 'w1' }))).toBe(null)
    expect(sessionProgress(session(1, 4, { backfill: true }))).toBe(null)
  })
  it('is the share of the session’s sets that are done', () => {
    expect(sessionProgress(session(0, 4))).toBe(0)
    expect(sessionProgress(session(1, 4))).toBe(0.25)
    expect(sessionProgress(session(4, 4))).toBe(1)
  })
  it('is 0 for a session with no sets yet', () => {
    expect(sessionProgress({ entries: [] })).toBe(0)
  })
})

describe('dynamicAccent', () => {
  it('is red on a training day not trained yet', () => {
    expect(dynamicAccent(state(), ISO)).toBe(DYNAMIC_STOPS[0])
  })
  it('is the final green once a workout is logged today', () => {
    expect(dynamicAccent(state({ workouts: [{ d: ISO, entries: [] }] }), ISO)).toBe(DYNAMIC_STOPS.at(-1))
  })
  it('is the neutral colour on a rest day', () => {
    expect(dynamicAccent(state({ week: {} }), ISO)).toBe(REST_COLOR)
    expect(dynamicAccent(state({ dayPlan: { [ISO]: 'rest' } }), ISO)).toBe(REST_COLOR)
  })
  it('a day whose routines have no exercises counts as rest', () => {
    expect(dynamicAccent(state({ routines: [{ id: 'r1', name: 'Empty', ex: [] }] }), ISO)).toBe(REST_COLOR)
  })
  it('follows the sets of a session in progress, rest day or not', () => {
    expect(dynamicAccent(state({ active: session(2, 4) }), ISO)).toBe(progressColor(0.5))
    expect(dynamicAccent(state({ week: {}, active: session(0, 4) }), ISO)).toBe(DYNAMIC_STOPS[0])
  })
  it('a second session today shows its own progress', () => {
    expect(dynamicAccent(state({ workouts: [{ d: ISO, entries: [] }], active: session(1, 4) }), ISO)).toBe(progressColor(0.25))
  })
  it('an old workout open in the editor is not a session in progress', () => {
    expect(dynamicAccent(state({ active: session(4, 4, { editingWorkoutId: 'w1' }) }), ISO)).toBe(DYNAMIC_STOPS[0])
  })
  it('a workout logged on another day does not count', () => {
    expect(dynamicAccent(state({ workouts: [{ d: '2026-08-18', entries: [] }] }), ISO)).toBe(DYNAMIC_STOPS[0])
  })
})

describe('the dynamic choice in accent.js', () => {
  it('is a known key, which liveAccentValue draws as the colour of the moment', () => {
    const S = state({ accent: DYNAMIC, workouts: [{ d: '2000-01-01', entries: [] }] })
    expect(accentKey(S)).toBe(DYNAMIC)
    expect(accentValue(S)).toBe(DYNAMIC)
    expect(liveAccentValue(S)).toMatch(/^#[0-9a-f]{6}$/)
    expect(liveAccentValue({ accent: 'sky' })).toBe('sky')
  })
  it('survives sanitizing', () => {
    expect(sanitizeAccent({ accent: DYNAMIC }).accent).toBe(DYNAMIC)
  })
})

// The user's own colours (Settings → Accent color → Dynamic): S.dynamicColors = { start, end, rest }.
const hueOf = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('dynamicStops', () => {
  it('is the built-in ramp when no colour of the user’s own is set', () => {
    expect(dynamicStops({})).toEqual(DYNAMIC_STOPS)
    expect(dynamicStops({ dynamicColors: {} })).toEqual(DYNAMIC_STOPS)
    expect(dynamicStops({ dynamicColors: { rest: '#123456' } })).toEqual(DYNAMIC_STOPS)
  })
  it('runs from the user’s start to their end, same number of stops', () => {
    const stops = dynamicStops({ dynamicColors: { start: '#8a2be2', end: '#00bfff' } })
    expect(stops).toHaveLength(DYNAMIC_STOPS.length)
    expect(stops[0]).toBe('#8a2be2')
    expect(stops.at(-1)).toBe('#00bfff')
  })
  it('keeps the built-in colour for the one end the user left alone', () => {
    expect(dynamicStops({ dynamicColors: { start: '#8a2be2' } }).at(-1)).toBe(DYNAMIC_STOPS.at(-1))
    expect(dynamicStops({ dynamicColors: { end: '#00bfff' } })[0]).toBe(DYNAMIC_STOPS[0])
  })
  it('ignores anything that is not a plain #rrggbb', () => {
    expect(dynamicStops({ dynamicColors: { start: 'red', end: 'url(x)' } })).toEqual(DYNAMIC_STOPS)
  })
})

describe('hueRamp', () => {
  it('goes round the colour wheel the short way, so red to green passes through yellow, not brown', () => {
    const mid = hueRamp('#ff0000', '#00ff00', 5)[2]
    expect(hueOf(mid)).toBeGreaterThan(45)
    expect(hueOf(mid)).toBeLessThan(75)
    // Bright, not muddy: the middle keeps the ends' saturation.
    const [r, g, b] = [1, 3, 5].map(i => parseInt(mid.slice(i, i + 2), 16))
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(200)
  })
  it('crosses 0° when that is shorter (magenta to orange through red)', () => {
    const mid = hueRamp('#ff00ff', '#ff8000', 3)[1]
    const h = hueOf(mid)
    expect(h > 330 || h < 10).toBe(true)
  })
  it('a grey end takes the other end’s hue instead of swinging through red', () => {
    const ramp = hueRamp('#808080', '#0000ff', 5)
    for (const c of ramp.slice(1)) expect(Math.abs(hueOf(c) - 240)).toBeLessThan(1)
  })
})

describe('the user’s colours in dynamicAccent', () => {
  const own = { start: '#8a2be2', end: '#00bfff', rest: '#ff69b4' }
  it('not trained yet is their start, done is their end, rest is their rest', () => {
    expect(dynamicAccent(state({ dynamicColors: own }), ISO)).toBe(own.start)
    expect(dynamicAccent(state({ dynamicColors: own, workouts: [{ d: ISO, entries: [] }] }), ISO)).toBe(own.end)
    expect(dynamicAccent(state({ dynamicColors: own, week: {} }), ISO)).toBe(own.rest)
  })
  it('a session in progress walks their ramp', () => {
    const stops = dynamicStops({ dynamicColors: own })
    expect(dynamicAccent(state({ dynamicColors: own, active: session(2, 4) }), ISO)).toBe(progressColor(0.5, stops))
  })
  it('rest falls back to the built-in blue when theirs is unset or malformed', () => {
    expect(restColorOf({ dynamicColors: { rest: 'blue' } })).toBe(REST_COLOR)
    expect(restColorOf({})).toBe(REST_COLOR)
  })
})

describe('sanitizeAccent and dynamicColors', () => {
  it('keeps the valid colours in lowercase and drops the rest, and the key when nothing is left', () => {
    expect(sanitizeAccent({ dynamicColors: { start: '#8A2BE2', end: 'nope', rest: 5, extra: '#000000' } }).dynamicColors).toEqual({ start: '#8a2be2' })
    expect('dynamicColors' in sanitizeAccent({ dynamicColors: { start: 'x' } })).toBe(false)
    expect('dynamicColors' in sanitizeAccent({ dynamicColors: 'red' })).toBe(false)
  })
})
