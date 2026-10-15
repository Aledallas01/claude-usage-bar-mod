// Consumo della sessione: quanto sono saliti i limiti di 5 ore e settimanale
// mentre questa sessione lavorava. I limiti sono dell'account, quindi è una
// stima: conta gli aumenti visti durante un turno di questa sessione (più un
// breve margine dopo, per le letture che arrivano in ritardo).

import type { WindowKind } from './windows'

/** Dopo la fine di un turno, gli aumenti visti entro questo tempo contano ancora. */
export const SESSION_GRACE_MS = 2 * 60_000

/** Due orari di reset più vicini di così sono la stessa finestra (arrotondamenti). */
const SAME_WINDOW_MS = 10 * 60_000

export type SessionUseEntry = {
  /** Reset della finestra in cui si conta. */
  resetsAt?: string
  /** Ultima percentuale vista. */
  last: number
  /** Punti saliti durante i turni di questa sessione, nella finestra attuale. */
  used: number
}

export type SessionUse = Partial<Record<WindowKind, SessionUseEntry>>

type Reading = { kind: string; percentUsed: number; resetsAt?: string; name?: string }

function sameWindow(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return a === b

  return Math.abs(ta - tb) < SAME_WINDOW_MS
}

/**
 * Aggiorna il conteggio con una nuova lettura. `isActive`: questa sessione sta
 * lavorando (turno in corso o appena finito). Gli aumenti fuori dai turni
 * vengono da altre sessioni o da claude.ai e non si contano.
 */
export function accrue(use: SessionUse, readings: readonly Reading[], isActive: boolean): SessionUse {
  const next: SessionUse = { ...use }
  for (const r of readings) {
    if (r.kind !== 'five_hour' && r.kind !== 'seven_day') continue
    if (r.name !== undefined) continue
    if (!Number.isFinite(r.percentUsed)) continue
    const kind: WindowKind = r.kind
    const prev = next[kind]
    if (prev === undefined) {
      // Prima lettura: è il punto di partenza, non consumo della sessione.
      next[kind] = { resetsAt: r.resetsAt, last: r.percentUsed, used: 0 }
      continue
    }
    if (!sameWindow(prev.resetsAt, r.resetsAt)) {
      // Nuova finestra: quel che c'è già è stato usato dopo il reset.
      const used = isActive && prev.resetsAt !== undefined ? Math.max(0, r.percentUsed) : 0
      next[kind] = { resetsAt: r.resetsAt, last: r.percentUsed, used }
      continue
    }
    const rise = r.percentUsed - prev.last
    if (rise <= 0) {
      if (rise < 0) next[kind] = { ...prev, last: r.percentUsed }
      continue
    }
    next[kind] = { resetsAt: r.resetsAt ?? prev.resetsAt, last: r.percentUsed, used: prev.used + (isActive ? rise : 0) }
  }

  return next
}

/** true se la sessione sta lavorando: turno aperto o finito da poco. */
export function isSessionActive(openTurns: number, lastTurnEnd: number, now: number): boolean {
  return openTurns > 0 || (lastTurnEnd > 0 && now - lastTurnEnd <= SESSION_GRACE_MS)
}

/** Punti arrotondati a una cifra decimale, senza "-0". */
export function roundUse(points: number): number {
  const r = Math.round(points * 10) / 10

  return r === 0 ? 0 : r
}
