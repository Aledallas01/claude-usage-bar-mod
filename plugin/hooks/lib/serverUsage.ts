// Limiti letti dal server: la stessa fonte del popup "Limiti di utilizzo del
// piano" di Claude, aggiornata anche tra una risposta e l'altra e con il
// consumo fatto da claude.ai. La richiesta la fa il motore con la credenziale
// della sessione (`$.session.authorize`): la mod non vede mai il token.

import { toEpochMs } from './timeWindow'
import { WINDOW_ORDER } from './windows'
import type { RawLimit, UsageWindow } from './windows'

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
export const USAGE_HEADERS: Record<string, string> = { 'anthropic-beta': 'oauth-2025-04-20' }

/**
 * `{ five_hour: { utilization, resets_at }, seven_day: {...}, ... }` → limiti
 * nel formato del motore. `utilization` è già in percentuale (0–100).
 * Finestre assenti, nulle o malformate vengono ignorate.
 */
export function parseServerUsage(text: string): RawLimit[] {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return []
  }
  if (body === null || typeof body !== 'object') return []
  const limits: RawLimit[] = []
  for (const kind of ['five_hour', 'seven_day'] as const) {
    const w = (body as Record<string, unknown>)[kind]
    if (w === null || typeof w !== 'object') continue
    const { utilization, resets_at } = w as { utilization?: unknown; resets_at?: unknown }
    if (typeof utilization !== 'number' || !Number.isFinite(utilization)) continue
    const limit: RawLimit = { kind, percentUsed: Math.round(utilization * 10) / 10 }
    if (typeof resets_at === 'string') limit.resetsAt = resets_at
    limits.push(limit)
  }

  return limits
}

// Lo stesso reset scritto da fonti diverse può differire di qualche secondo.
const SAME_RESET_MS = 5 * 60_000

function sameWindow(a: UsageWindow, b: UsageWindow): boolean {
  const ra = toEpochMs(a.resetsAt)
  const rb = toEpochMs(b.resetsAt)
  if (ra === undefined || rb === undefined) return ra === rb

  return Math.abs(ra - rb) <= SAME_RESET_MS
}

/**
 * Unisce due letture finestra per finestra. Dentro la stessa finestra
 * l'utilizzo può solo crescere, quindi vince il valore più alto: una lettura
 * in ritardo (gli header di una risposta, un'altra sessione) non fa tornare
 * indietro la percentuale. Con un reset diverso vince la finestra più recente.
 */
export function mergeWindows(base: readonly UsageWindow[], incoming: readonly UsageWindow[]): UsageWindow[] {
  const byKind = new Map(base.map(w => [w.kind, w] as const))
  for (const w of incoming) {
    const old = byKind.get(w.kind)
    if (old === undefined) {
      byKind.set(w.kind, w)
      continue
    }
    if (sameWindow(old, w)) {
      if (w.percentUsed > old.percentUsed || (w.percentUsed === old.percentUsed && old.resetsAt === undefined)) byKind.set(w.kind, w)
      continue
    }
    const ro = toEpochMs(old.resetsAt) ?? -Infinity
    const rn = toEpochMs(w.resetsAt) ?? -Infinity
    if (rn > ro) byKind.set(w.kind, w)
  }

  return WINDOW_ORDER.flatMap(kind => {
    const w = byKind.get(kind)

    return w ? [w] : []
  })
}
