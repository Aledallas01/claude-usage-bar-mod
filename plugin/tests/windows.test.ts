import { describe, expect, test } from 'claude-code/testing'

import { describeWindows, pickWindows } from '../hooks/lib/windows'

const H = 3_600_000

/** Uguaglianza a meno di errori di arrotondamento in virgola mobile. */
function expectNear(actual: unknown, expected: number) {
  expect(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9 ? expected : actual).toBe(expected)
}

describe('rilevamento delle finestre', () => {
  test('tiene solo five_hour e seven_day, nell ordine dell app', () => {
    const picked = pickWindows([
      { kind: 'spend_limit', percentUsed: 12 },
      { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-10-14T08:00:00Z' },
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-10T20:00:00Z' },
    ])
    expect(picked.map(w => w.kind)).toEqual(['five_hour', 'seven_day'])
    expect(picked[0]?.label).toBe('Limite di sessione')
    expect(picked[1]?.label).toBe('Settimanale · tutti i modelli')
  })
  test('i valori reali passano invariati', () => {
    const [w] = pickWindows([{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-10T20:00:00Z' }])
    expect(w).toEqual({
      kind: 'five_hour',
      label: 'Limite di sessione',
      percentUsed: 23.5,
      resetsAt: '2026-10-10T20:00:00Z',
    })
  })
  test('scarta dati non validi e duplicati', () => {
    const picked = pickWindows([
      null,
      'five_hour',
      { kind: 'five_hour', percentUsed: Number.NaN },
      { kind: 'five_hour', percentUsed: '40' },
      { kind: 'five_hour', percentUsed: 40, resetsAt: 'non-una-data' },
      { kind: 'five_hour', percentUsed: 99 },
    ])
    expect(picked).toEqual([{ kind: 'five_hour', label: 'Limite di sessione', percentUsed: 40 }])
    expect(pickWindows(undefined)).toEqual([])
    expect(pickWindows(null)).toEqual([])
  })
  test('5 ore e 7 giorni con reset diversi hanno progressioni indipendenti', () => {
    const now = Date.parse('2026-10-10T17:30:00Z')
    const views = describeWindows(
      pickWindows([
        { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-10T20:00:00Z' },
        { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-14T17:30:00Z' },
      ]),
      now,
    )
    const [five, seven] = views
    expectNear(five?.time.ok && five.time.elapsedPercent, 50)
    expectNear(seven?.time.ok && seven.time.elapsedPercent, (3 / 7) * 100)
    expect(five?.percentUsed).toBe(42)
    expect(seven?.percentUsed).toBe(18)
  })
  test('senza reset la stima non è disponibile', () => {
    const [view] = describeWindows(pickWindows([{ kind: 'seven_day', percentUsed: 5 }]), Date.now())
    expect(view?.time).toEqual({ ok: false, reason: 'missing-reset' })
  })
  test('durate configurate sostituiscono quelle nominali', () => {
    const now = Date.parse('2026-10-10T18:00:00Z')
    const [view] = describeWindows(
      pickWindows([{ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-10T20:00:00Z' }]),
      now,
      { five_hour: 4 * H, seven_day: 7 * 24 * H },
    )
    expectNear(view?.time.ok && view.time.elapsedPercent, 50)
  })
})
