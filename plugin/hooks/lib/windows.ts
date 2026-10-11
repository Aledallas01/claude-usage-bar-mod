// Rilevamento delle finestre di utilizzo dai dati che il motore di Claude Code
// riceve dall'API (`SessionRateLimit`: kind, percentUsed, resetsAt).

import { estimateWindow, toEpochMs } from './timeWindow'
import type { TimeEstimate } from './timeWindow'

export type WindowKind = 'five_hour' | 'seven_day'

export type RawLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageWindow = {
  kind: WindowKind
  /** Etichetta uguale a quella del popup dei limiti di Claude. */
  label: string
  /** Percentuale reale comunicata da Claude, invariata. */
  percentUsed: number
  /** Reset come comunicato da Claude (ISO 8601), invariato. */
  resetsAt?: string
}

export const WINDOW_ORDER: readonly WindowKind[] = ['five_hour', 'seven_day']

export const WINDOW_LABELS: Record<WindowKind, string> = {
  five_hour: 'Limite di sessione',
  seven_day: 'Settimanale · tutti i modelli',
}

/**
 * Durata nominale di ciascuna finestra, ricavata dal suo identificativo
 * (`five_hour`, `seven_day`): serve solo a stimare l'inizio quando i dati
 * non lo forniscono. Sovrascrivibile da configurazione.
 */
export const DEFAULT_DURATIONS_MS: Record<WindowKind, number> = {
  five_hour: 5 * 60 * 60 * 1000,
  seven_day: 7 * 24 * 60 * 60 * 1000,
}

function isWindowKind(kind: unknown): kind is WindowKind {
  return kind === 'five_hour' || kind === 'seven_day'
}

/**
 * Estrae le finestre di 5 ore e 7 giorni, nell'ordine dell'app. Valori non
 * validi (percentuale non numerica, kind sconosciuto) vengono scartati; un
 * resetsAt non valido viene tolto, così la stima risulta "non disponibile".
 */
export function pickWindows(limits: readonly unknown[] | null | undefined): UsageWindow[] {
  if (!Array.isArray(limits)) return []
  const found = new Map<WindowKind, UsageWindow>()
  for (const item of limits) {
    if (item === null || typeof item !== 'object') continue
    const { kind, percentUsed, resetsAt } = item as Partial<RawLimit>
    if (!isWindowKind(kind) || typeof percentUsed !== 'number' || !Number.isFinite(percentUsed)) continue
    if (found.has(kind)) continue
    const window: UsageWindow = { kind, label: WINDOW_LABELS[kind], percentUsed }
    if (typeof resetsAt === 'string' && toEpochMs(resetsAt) !== undefined) window.resetsAt = resetsAt
    found.set(kind, window)
  }

  return WINDOW_ORDER.flatMap(kind => {
    const window = found.get(kind)

    return window ? [window] : []
  })
}

export type WindowView = UsageWindow & { time: TimeEstimate }

/** Abbina a ogni finestra la sua progressione temporale teorica. */
export function describeWindows(
  windows: readonly UsageWindow[],
  now: number,
  durations: Record<WindowKind, number> = DEFAULT_DURATIONS_MS,
): WindowView[] {
  return windows.map(window => ({
    ...window,
    time: estimateWindow({ resetAt: window.resetsAt, durationMs: durations[window.kind], now }),
  }))
}
