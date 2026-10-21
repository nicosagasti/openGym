import { describe, expect, it } from 'vitest'
import { DYNAMIC_STOPS, REST_COLOR, progressColor, sessionProgress, dynamicAccent, liveAccentValue } from './dynamic-accent.js'
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
