import { describe, expect, test } from 'claude-code/testing'

import { estimateWindow, formatDuration, formatPercent, formatResetTime, toEpochMs } from '../hooks/lib/timeWindow'

const H = 3_600_000

/** Uguaglianza a meno di errori di arrotondamento in virgola mobile. */
function expectNear(actual: unknown, expected: number) {
  expect(typeof actual === 'number' && Math.abs(actual - expected) < 1e-9 ? expected : actual).toBe(expected)
}
const D = 24 * H
const RESET = Date.parse('2026-10-10T20:00:00Z')

function ratioAt(now: number, durationMs = 5 * H, resetAt: unknown = RESET) {
  const t = estimateWindow({ resetAt, durationMs, now })
  if (!t.ok) throw new Error(`stima non disponibile: ${t.reason}`)

  return t
}

describe('elapsedRatio su finestra di 5 ore', () => {
  test('0% all inizio della finestra', () => {
    const t = ratioAt(RESET - 5 * H)
    expect(t.elapsedRatio).toBe(0)
    expect(t.elapsedPercent).toBe(0)
    expect(t.isStartDerived).toBe(true)
  })
  test('25%, 50%, 75%', () => {
    expectNear(ratioAt(RESET - 3.75 * H).elapsedPercent, 25)
    expectNear(ratioAt(RESET - 2.5 * H).elapsedPercent, 50)
    expectNear(ratioAt(RESET - 1.25 * H).elapsedPercent, 75)
  })
  test('100% esattamente al reset, marcato come reset avvenuto', () => {
    const t = ratioAt(RESET)
    expect(t.elapsedPercent).toBe(100)
    expect(t.isResetPassed).toBe(true)
    expect(t.remainingMs).toBe(0)
  })
  test('reset imminente', () => {
    const t = ratioAt(RESET - 30_000)
    expect(t.isResetPassed).toBe(false)
    expect(t.elapsedPercent).toBeGreaterThan(99.8)
    expect(t.remainingMs).toBe(30_000)
    expect(formatDuration(t.remainingMs)).toBe('meno di 1 min')
  })
  test('reset già avvenuto: limitato a 100% e segnalato', () => {
    const t = ratioAt(RESET + 2 * H)
    expect(t.elapsedRatio).toBe(1)
    expect(t.isResetPassed).toBe(true)
    expect(t.remainingMs).toBe(0)
  })
  test('ora prima dell inizio: limitato a 0%', () => {
    const t = ratioAt(RESET - 6 * H)
    expect(t.elapsedRatio).toBe(0)
    expect(t.isBeforeStart).toBe(true)
  })
})

describe('dati mancanti o non validi', () => {
  test('reset mancante senza inizio', () => {
    expect(estimateWindow({ durationMs: 5 * H, now: RESET })).toEqual({ ok: false, reason: 'missing-reset' })
  })
  test('reset presente ma durata sconosciuta e inizio mancante', () => {
    expect(estimateWindow({ resetAt: RESET, now: RESET })).toEqual({ ok: false, reason: 'unknown-duration' })
  })
  test('timestamp non validi', () => {
    for (const bad of ['', 'domani', 'NaN', null, undefined, Number.NaN, -5, 0, true, {}]) {
      expect(estimateWindow({ resetAt: bad, durationMs: 5 * H, now: RESET }).ok).toBe(false)
    }
  })
  test('ora corrente non valida', () => {
    expect(estimateWindow({ resetAt: RESET, durationMs: 5 * H, now: 'ieri' })).toEqual({
      ok: false,
      reason: 'invalid-now',
    })
  })
  test('finestra con fine prima dell inizio', () => {
    expect(estimateWindow({ windowStart: RESET, resetAt: RESET - H, now: RESET })).toEqual({
      ok: false,
      reason: 'invalid-window',
    })
  })
  test('inizio reale usato quando disponibile, senza durata', () => {
    const t = estimateWindow({ windowStart: RESET - 4 * H, resetAt: RESET, now: RESET - H })
    expectNear(t.ok && t.elapsedPercent, 75)
    expect(t.ok && t.isStartDerived).toBe(false)
  })
  test('reset ricavato da inizio + durata', () => {
    const t = estimateWindow({ windowStart: RESET - 5 * H, durationMs: 5 * H, now: RESET - 2.5 * H })
    expect(t.ok && t.resetAt).toBe(RESET)
  })
})

describe('formati dei timestamp', () => {
  test('secondi, millisecondi, stringhe numeriche, ISO e Date coincidono', () => {
    const variants = [RESET, RESET / 1000, String(RESET / 1000), '2026-10-10T20:00:00Z', new Date(RESET)]
    for (const v of variants) expect(toEpochMs(v)).toBe(RESET)
    const now = RESET - 2.5 * H
    for (const v of variants) expectNear(ratioAt(now, 5 * H, v).elapsedPercent, 50)
  })
})

describe('fusi orari e ora legale', () => {
  test('lo stesso istante in fusi diversi dà lo stesso risultato', () => {
    const now = RESET - 2.5 * H
    const rome = ratioAt(now, 5 * H, '2026-10-10T22:00:00+02:00')
    const ny = ratioAt(now, 5 * H, '2026-10-10T16:00:00-04:00')
    const utc = ratioAt(now, 5 * H, '2026-10-10T20:00:00Z')
    expect(rome.elapsedRatio).toBe(utc.elapsedRatio)
    expect(ny.elapsedRatio).toBe(utc.elapsedRatio)
  })
  test('formattazione locale dipende dal fuso, il calcolo no', () => {
    expect(formatResetTime(RESET, RESET - H, 'Europe/Rome')).toBe('22:00')
    expect(formatResetTime(RESET, RESET - H, 'America/New_York')).toBe('16:00')
  })
  test('finestra di 7 giorni attraverso la fine dell ora legale europea (25/10/2026)', () => {
    // Reset mercoledì 28/10 10:00 ora di Roma (CET, UTC+1) = 09:00Z.
    const reset = '2026-10-28T10:00:00+01:00'
    const resetMs = Date.parse(reset)
    const t = ratioAt(resetMs - 3.5 * D, 7 * D, reset)
    expectNear(t.elapsedPercent, 50)
    // L'inizio stimato è 168 ore assolute prima: 21/10 11:00 CEST, non 10:00.
    expect(t.windowStart).toBe(Date.parse('2026-10-21T11:00:00+02:00'))
    expect(formatResetTime(t.windowStart, t.windowStart, 'Europe/Rome')).toBe('11:00')
  })
  test('cambio di ora legale con inizio reale fornito: durata effettiva 169 ore', () => {
    const start = Date.parse('2026-10-21T10:00:00+02:00')
    const reset = Date.parse('2026-10-28T10:00:00+01:00')
    const t = estimateWindow({ windowStart: start, resetAt: reset, now: start + 83.5 * H })
    expect(t.ok && t.durationMs).toBe(169 * H)
    expectNear(t.ok && t.elapsedPercent, (83.5 / 169) * 100)
  })
  test('passaggio di giorno, settimana e mese', () => {
    // Finestra di 5 ore a cavallo della mezzanotte di fine mese.
    const t = ratioAt(Date.parse('2026-10-31T23:30:00Z'), 5 * H, '2026-11-01T02:00:00Z')
    expectNear(t.elapsedPercent, 50)
    expect(formatResetTime(Date.parse('2026-11-01T02:00:00Z'), Date.parse('2026-10-31T23:30:00Z'), 'UTC')).toBe(
      'dom 02:00',
    )
  })
})

describe('formattazione', () => {
  test('durate', () => {
    expect(formatDuration(59_000)).toBe('meno di 1 min')
    expect(formatDuration(7 * 60_000)).toBe('7 min')
    expect(formatDuration(2 * H + 15 * 60_000)).toBe('2 h 15 min')
    expect(formatDuration(3 * D + 4 * H)).toBe('3 g 4 h')
    expect(formatDuration(2 * D)).toBe('2 g')
  })
  test('percentuali senza decimali spuri', () => {
    expect(formatPercent(42)).toBe('42%')
    expect(formatPercent(18.5)).toBe('18.5%')
    expect(formatPercent(7.000000000000001)).toBe('7%')
  })
})
