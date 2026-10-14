import { describe, expect, test } from 'claude-code/testing'

import { mergeWindows, parseServerExtras, parseServerUsage, retryAfterMs } from '../hooks/lib/serverUsage'
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

describe('retry-after', () => {
  const NOW = Date.parse('2026-10-11T14:00:00Z')
  test('secondi, data HTTP, assente o non valido', () => {
    expect(retryAfterMs('120', NOW)).toBe(120_000)
    expect(retryAfterMs('Sun, 11 Oct 2026 14:05:00 GMT', NOW)).toBe(300_000)
    expect(retryAfterMs(undefined, NOW)).toBeUndefined()
    expect(retryAfterMs('presto', NOW)).toBeUndefined()
  })
})

describe('limiti per modello e crediti (come nel popup di Claude)', () => {
  // Estratto della risposta reale del server (solo percentuali, date e importi).
  const REAL = JSON.stringify({
    five_hour: { utilization: 0.0, resets_at: '2026-10-14T22:39:59.717406+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
    seven_day: { utilization: 81.0, resets_at: '2026-10-15T10:00:00.717427+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
    seven_day_opus: null,
    iguana_necktie: { utilization: 0.0, resets_at: '2026-11-05T07:59:00+00:00', limit_dollars: 250, used_dollars: 0.0, remaining_dollars: 250.0, locked_reason: null },
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
    limits: [
      { kind: 'session', group: 'session', percent: 0, resets_at: '2026-10-14T22:39:59.717406+00:00', scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: 81, resets_at: '2026-10-15T10:00:00.717427+00:00', scope: null },
      { kind: 'weekly_scoped', group: 'weekly', percent: 91, resets_at: '2026-10-15T09:59:59.717601+00:00', scope: { model: { id: null, display_name: 'Fable' }, surface: null } },
    ],
  })

  test('Settimanale · Fable dal campo limits, con nome e reset', () => {
    expect(parseServerExtras(REAL).scoped).toEqual([
      { kind: 'seven_day', label: 'Fable', name: 'Fable', percentUsed: 91, resetsAt: '2026-10-15T09:59:59.717601+00:00' },
    ])
  })

  test('crediti cloud riconosciuti dalla forma, qualunque sia il nome del campo', () => {
    expect(parseServerExtras(REAL).credits).toEqual([
      { id: 'iguana_necktie', limit: 250, used: 0, remaining: 250, currency: 'USD', expiresAt: '2026-11-05T07:59:00+00:00' },
    ])
  })

  test('le finestre principali restano quelle di prima', () => {
    expect(parseServerUsage(REAL).map(l => [l.kind, l.percentUsed])).toEqual([
      ['five_hour', 0],
      ['seven_day', 81],
    ])
  })

  test('risposta senza limiti per modello né crediti: elenchi vuoti', () => {
    expect(parseServerExtras('{"five_hour":{"utilization":3}}')).toEqual({ scoped: [], credits: [] })
    expect(parseServerExtras('non json')).toEqual({ scoped: [], credits: [] })
  })
})
