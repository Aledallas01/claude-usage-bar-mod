// Limiti letti dal server: la stessa fonte del popup "Limiti di utilizzo del
// piano" di Claude, aggiornata anche tra una risposta e l'altra e con il
// consumo fatto da claude.ai. La richiesta la fa il motore con la credenziale
// della sessione (`$.session.authorize`): la mod non vede mai il token.

import { toEpochMs } from './timeWindow'
import { WINDOW_ORDER } from './windows'
import type { RawLimit, UsageWindow, WindowKind } from './windows'

/** Crediti a importo, come "Crediti per sessioni cloud" nel popup di Claude. */
export type Credit = {
  id: string
  limit: number
  used: number
  remaining: number
  currency: string
  expiresAt?: string
}

/** Ripartizione del settimanale per prodotto ("Claude Code 38% · Chat 62%"). */
export type Breakdown = { key: string; name: string; percent: number }

export type ServerExtras = { scoped: UsageWindow[]; credits: Credit[]; breakdown: Breakdown[] }

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

/** `retry-after` in secondi o come data HTTP; undefined se assente o non valido. */
export function retryAfterMs(header: string | undefined, now: number): number | undefined {
  if (header === undefined) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(header)

  return Number.isFinite(at) ? Math.max(0, at - now) : undefined
}

const GROUP_KIND: Record<string, WindowKind> = { session: 'five_hour', weekly: 'seven_day' }

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Ciò che il popup di Claude mostra oltre a 5 ore e settimanale:
 * - i limiti di un singolo modello: voci di `limits` con `scope.model`
 *   ("Settimanale · Fable");
 * - i crediti a importo ("Crediti per sessioni cloud"): voci del primo livello
 *   con `limit_dollars` e `remaining_dollars` numerici. Il nome del campo è un
 *   nome in codice che cambia, quindi si riconoscono dalla forma.
 */
export function parseServerExtras(text: string): ServerExtras {
  const out: ServerExtras = { scoped: [], credits: [], breakdown: [] }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return out
  }
  if (body === null || typeof body !== 'object') return out
  const root = body as Record<string, unknown>

  if (Array.isArray(root.limits)) {
    for (const item of root.limits) {
      if (item === null || typeof item !== 'object') continue
      const { group, percent, resets_at, scope } = item as Record<string, unknown>
      const kind = typeof group === 'string' ? GROUP_KIND[group] : undefined
      const model = (scope as { model?: { display_name?: unknown } } | null | undefined)?.model
      const name = typeof model?.display_name === 'string' ? model.display_name.trim() : ''
      if (kind === undefined || name === '' || !finite(percent)) continue
      if (out.scoped.some(w => w.kind === kind && w.name === name)) continue
      const w: UsageWindow = { kind, label: name, name, percentUsed: Math.round(percent * 10) / 10 }
      if (typeof resets_at === 'string' && toEpochMs(resets_at) !== undefined) w.resetsAt = resets_at
      out.scoped.push(w)
    }
  }

  // "seven_day_breakdown": { rows: [{ key, display_name, percent }] }
  const bd = root.seven_day_breakdown as { rows?: unknown } | null | undefined
  if (bd !== null && typeof bd === 'object' && Array.isArray(bd.rows)) {
    for (const row of bd.rows) {
      if (row === null || typeof row !== 'object') continue
      const { key, display_name, percent } = row as Record<string, unknown>
      if (typeof key !== 'string' || !finite(percent)) continue
      out.breakdown.push({ key, name: typeof display_name === 'string' ? display_name : key, percent: Math.round(percent) })
    }
  }

  for (const [id, value] of Object.entries(root)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const { limit_dollars, used_dollars, remaining_dollars, resets_at } = value as Record<string, unknown>
    if (!finite(limit_dollars) || !finite(remaining_dollars) || limit_dollars <= 0) continue
    const used = finite(used_dollars) ? used_dollars : Math.max(0, limit_dollars - remaining_dollars)
    const credit: Credit = { id, limit: limit_dollars, used, remaining: remaining_dollars, currency: 'USD' }
    if (typeof resets_at === 'string' && toEpochMs(resets_at) !== undefined) credit.expiresAt = resets_at
    out.credits.push(credit)
  }

  return out
}
