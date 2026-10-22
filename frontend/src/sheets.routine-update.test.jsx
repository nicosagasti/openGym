// @vitest-environment happy-dom
// Finishing a session that changed its routine asks whether to keep the changes
// (lib/routine-sync.js): Update routine, Save as new routine, or Keep as is, then the summary.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { finishWorkout } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const S = () => useStore.getState().S
const mounted = []
const BENCH = '0025', FLY = '0308', DIP = '0251'

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
function tap(host, text) {
  const target = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  expect(target, text).toBeTruthy()
  act(() => { target.click() })
}

const done = () => [{ w: 50, r: 8, done: true }]
// A Push routine of bench + flyes; the session did bench and swapped flyes for dips.
function install({ entries, ask } = {}) {
  const st = clone(DEF)
  st.routines = [{ id: 'r1', name: 'Push', ex: [{ id: BENCH, sets: 1, reps: 8, weight: 50 }, { id: FLY, sets: 1, reps: 8, weight: 20 }] }]
  if (ask !== undefined) st.askRoutineUpdate = ask
  st.active = {
    id: 'fin', d: '2026-10-22', start: Date.now() - 20 * 60000, routineId: 'r1', routineIds: ['r1'], name: 'Push', bw: null, cur: 0,
    entries: entries || [
      { id: BENCH, rid: 'r1', target: { mode: 'reps', sets: 1, reps: 8, weight: 50 }, sets: done() },
      { id: DIP, rid: 'r1', target: { mode: 'reps', sets: 1, reps: 8, weight: 0 }, sets: done() },
    ],
  }
  useStore.setState({ S: st, user: null })
}
const titles = () => [...document.body.querySelectorAll('h3')].map(h => h.textContent)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useUI.getState().stopRest()
  useUI.setState({ sheets: [], timer: null, work: null })
})
afterEach(() => {
  mounted.splice(0).forEach(r => act(() => r.unmount()))
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('finishing a session that changed its routine', () => {
  it('saves the workout first, then asks, listing the change', () => {
    install()
    act(() => finishWorkout())
    expect(S().workouts).toHaveLength(1)
    expect(S().active).toBeNull()
    const host = renderTop()
    expect(host.textContent).toContain('Update “Push”?')
    expect(host.textContent).toMatch(/→/)
  })

  it('Update routine writes the session’s exercises into the routine, then shows the summary', () => {
    install()
    act(() => finishWorkout())
    tap(renderTop(), 'Update routine')
    expect(S().routines[0].ex.map(x => x.id)).toEqual([BENCH, DIP])
    renderTop()
    expect(titles()).toContain('Workout complete!')
  })

  it('Save as new routine leaves Push alone and adds a copy', () => {
    install()
    act(() => finishWorkout())
    tap(renderTop(), 'Save as new routine')
    expect(S().routines).toHaveLength(2)
    expect(S().routines[0].ex.map(x => x.id)).toEqual([BENCH, FLY])
    expect(S().routines[1]).toMatchObject({ name: 'Push (Copy)' })
    expect(S().routines[1].ex.map(x => x.id)).toEqual([BENCH, DIP])
  })

  it('Keep as is changes nothing and goes on to the summary', () => {
    install()
    act(() => finishWorkout())
    tap(renderTop(), 'Keep as is')
    expect(S().routines).toHaveLength(1)
    expect(S().routines[0].ex.map(x => x.id)).toEqual([BENCH, FLY])
    renderTop()
    expect(titles()).toContain('Workout complete!')
  })

  it('does not ask when the session matched its routine', () => {
    install({ entries: [
      { id: BENCH, rid: 'r1', target: { mode: 'reps', sets: 1, reps: 8, weight: 50 }, sets: done() },
      { id: FLY, rid: 'r1', target: { mode: 'reps', sets: 1, reps: 8, weight: 20 }, sets: done() },
    ] })
    act(() => finishWorkout())
    renderTop()
    expect(titles()).toContain('Workout complete!')
    expect(titles().join()).not.toContain('Update “Push”?')
  })

  it('does not ask with the setting off', () => {
    install({ ask: false })
    act(() => finishWorkout())
    renderTop()
    expect(titles()).toContain('Workout complete!')
    expect(S().routines[0].ex.map(x => x.id)).toEqual([BENCH, FLY])
  })
})
