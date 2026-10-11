// Modulo di calcolo temporale, indipendente dall'interfaccia.
//
// Tutta l'aritmetica avviene su istanti assoluti (millisecondi dall'epoca UTC):
// fusi orari e ora legale influiscono solo sulla formattazione per l'utente,
// mai sul calcolo di elapsedRatio.

/** Soglia sotto la quale un timestamp numerico è interpretato in secondi. */
const SECONDS_THRESHOLD = 1e11 // 1e11 s = anno 5138; 1e11 ms = marzo 1973

import { LOCALES } from './i18n'
import type { Lang } from './i18n'

export type TimeInput = {
  /** Inizio effettivo della finestra, se noto (ms, s, ISO 8601 o Date). */
  windowStart?: unknown
  /** Prossimo reset, se noto (ms, s, ISO 8601 o Date). */
  resetAt?: unknown
  /** Durata effettiva della finestra in ms, se nota. */
  durationMs?: number
  /** Ora corrente. */
  now: unknown
}

export type UnavailableReason =
  | 'invalid-now'
  | 'missing-reset'
  | 'unknown-duration'
  | 'invalid-window'

export type TimeEstimate =
  | {
      ok: true
      windowStart: number
      resetAt: number
      now: number
      durationMs: number
      /** clamp((now - windowStart) / (resetAt - windowStart), 0, 1) */
      elapsedRatio: number
      /** elapsedRatio * 100 */
      elapsedPercent: number
      /** Millisecondi al reset; 0 se il reset è già avvenuto. */
      remainingMs: number
      /** true quando now >= resetAt: il dato è superato. */
      isResetPassed: boolean
      /** true quando now < windowStart (orologio locale indietro). */
      isBeforeStart: boolean
      /** true quando l'inizio è ricavato da resetAt - durata. */
      isStartDerived: boolean
    }
  | { ok: false; reason: UnavailableReason }

/**
 * Converte un timestamp in millisecondi dall'epoca, o `undefined` se non valido.
 * Accetta numeri in secondi o millisecondi, stringhe numeriche, ISO 8601 e Date.
 */
export function toEpochMs(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === 'boolean') return undefined
  if (value instanceof Date) {
    const ms = value.getTime()

    return Number.isFinite(ms) ? ms : undefined
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined

    return value < SECONDS_THRESHOLD ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    if (/^\d+(\.\d+)?$/.test(trimmed)) return toEpochMs(Number(trimmed))
    // Solo stringhe con data esplicita: niente Date.parse di testo arbitrario.
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return undefined
    const ms = Date.parse(trimmed)

    return Number.isFinite(ms) && ms > 0 ? ms : undefined
  }

  return undefined
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Calcola la progressione temporale teorica di una finestra di utilizzo.
 *
 * L'inizio usato è, in ordine: `windowStart` se valido; altrimenti
 * `resetAt - durationMs` se la durata è nota. Senza nessuno dei due la stima
 * non è disponibile: nessun valore viene inventato.
 */
export function estimateWindow(input: TimeInput): TimeEstimate {
  const now = toEpochMs(input.now)
  if (now === undefined) return { ok: false, reason: 'invalid-now' }

  const duration =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0
      ? input.durationMs
      : undefined
  let start = toEpochMs(input.windowStart)
  let reset = toEpochMs(input.resetAt)
  let isStartDerived = false

  if (reset === undefined) {
    if (start === undefined || duration === undefined) return { ok: false, reason: 'missing-reset' }
    reset = start + duration
  }
  if (start === undefined) {
    if (duration === undefined) return { ok: false, reason: 'unknown-duration' }
    start = reset - duration
    isStartDerived = true
  }
  if (!(reset > start)) return { ok: false, reason: 'invalid-window' }

  const span = reset - start
  const elapsedRatio = clamp((now - start) / span, 0, 1)

  return {
    ok: true,
    windowStart: start,
    resetAt: reset,
    now,
    durationMs: span,
    elapsedRatio,
    elapsedPercent: elapsedRatio * 100,
    remainingMs: Math.max(0, reset - now),
    isResetPassed: now >= reset,
    isBeforeStart: now < start,
    isStartDerived,
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const DUR: Record<Lang, { d: string; h: string; m: string; less: string; sep: string }> = {
  it: { d: 'g', h: 'h', m: 'min', less: 'meno di 1 min', sep: ' ' },
  en: { d: 'd', h: 'h', m: 'm', less: 'less than 1 min', sep: '' },
}

/** "3 g 4 h" (it) / "3d 4h" (en), "2 h 15 min" / "2h 15m", "7 min" / "7m". */
export function formatDuration(ms: number, lang: Lang = 'it'): string {
  const u = DUR[lang]
  if (!Number.isFinite(ms) || ms < MINUTE) return u.less
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  const p = (n: number, unit: string) => `${n}${u.sep}${unit}`
  if (days > 0) return hours > 0 ? `${p(days, u.d)} ${p(hours, u.h)}` : p(days, u.d)
  if (hours > 0) return minutes > 0 ? `${p(hours, u.h)} ${p(minutes, u.m)}` : p(hours, u.h)

  return p(minutes, u.m)
}

/**
 * Orario locale del reset: "18:30" se cade oggi, "sab 18:30" entro una
 * settimana, altrimenti "12 ott 18:30" (nella lingua scelta, 24 ore).
 * `timeZone` serve ai test.
 */
export function formatResetTime(resetAt: number, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const loc = LOCALES[lang]
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(resetAt)
  const dayKey = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms)
  if (dayKey(resetAt) === dayKey(now)) return time
  if (Math.abs(resetAt - now) < 6 * DAY) {
    const weekday = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone }).format(resetAt)

    return `${weekday} ${time}`
  }
  const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone }).format(resetAt)

  return `${date} ${time}`
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}
