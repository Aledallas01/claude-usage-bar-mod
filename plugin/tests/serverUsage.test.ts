import { describe, expect, test } from 'claude-code/testing'

import { mergeWindows, parseServerUsage } from '../hooks/lib/serverUsage'
import { pickWindows } from '../hooks/lib/windows'

describe('risposta del server', () => {
  test('legge five_hour e seven_day, ignora il resto', () => {
    const text = JSON.stringify({
      five_hour: { utilization: 21.04, resets_at: '2026-10-11T16:20:00.4+00:00' },
      seven_day: { utilization: 32, resets_at: null },
      seven_day_opus: { utilization: 40, resets_at: '2026-10-15T10:00:00Z' },
      extra_usage: null,
    })
    expect(parseServerUsage(text)).toEqual([
      { kind: 'five_hour', percentUsed: 21, resetsAt: '2026-10-11T16:20:00.4+00:00' },
      { kind: 'seven_day', percentUsed: 32 },
    ])
  })

  test('testo non valido o finestre nulle: nessun dato', () => {
    expect(parseServerUsage('<html>')).toEqual([])
    expect(parseServerUsage('{"five_hour":null}')).toEqual([])
    expect(parseServerUsage('{"five_hour":{"utilization":"21"}}')).toEqual([])
  })
})

describe('unione delle letture', () => {
  const a = pickWindows([{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-11T16:20:00.000Z' }])
  const b = pickWindows([{ kind: 'five_hour', percentUsed: 21, resetsAt: '2026-10-11T16:20:00.412+00:00' }])

  test('stessa finestra: vince la percentuale più alta, in entrambi gli ordini', () => {
    expect(mergeWindows(a, b)[0]?.percentUsed).toBe(21)
    expect(mergeWindows(b, a)[0]?.percentUsed).toBe(21)
  })

  test('finestra nuova dopo il reset: vince anche se più bassa', () => {
    const next = pickWindows([{ kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-11T21:20:00Z' }])
    expect(mergeWindows(b, next)[0]?.percentUsed).toBe(2)
    expect(mergeWindows(next, b)[0]?.percentUsed).toBe(2)
  })

  test('aggiunge le finestre mancanti nell\'ordine dell\'app', () => {
    const week = pickWindows([{ kind: 'seven_day', percentUsed: 31 }])
    expect(mergeWindows(week, a).map(w => w.kind)).toEqual(['five_hour', 'seven_day'])
  })
})
