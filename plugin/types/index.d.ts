export type StoredWindow = {
  kind: 'five_hour' | 'seven_day'
  label: string
  percentUsed: number
  resetsAt?: string
  /** Solo per i limiti di un singolo modello: il suo nome ("Fable"). */
  name?: string
}

export type StoredContext = { tokens?: number; window: number; percent?: number }

/** Crediti a importo (es. "Crediti per sessioni cloud"), letti dal server. */
export type StoredCredit = {
  id: string
  limit: number
  used: number
  remaining: number
  currency: string
  expiresAt?: string
}

/** Ripartizione del settimanale per prodotto ("Claude Code 38% · Chat 62%"). */
export type StoredBreakdown = { key: string; name: string; percent: number }

/** Quota di consumo di un progetto nella finestra di 5 ore (stima dal costo). */
export type StoredProjectRow = { project: string; percent: number; isOthers?: boolean }

export type StoredProjectShare = { from: number; rows: StoredProjectRow[] }

export type StoredLimits = {
  observedAt: number
  windows: StoredWindow[]
  context?: StoredContext
  /** Limiti di un singolo modello ("Settimanale · Fable"), solo dal server. */
  scoped?: StoredWindow[]
  credits?: StoredCredit[]
  /** Ripartizione del settimanale per prodotto, dal server. */
  breakdown?: StoredBreakdown[]
  /** Quando il server ha comunicato scoped/credits/breakdown. */
  extrasAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-time-bar': {
      limits: StoredLimits | null
      now: number
      isHidden: boolean
      isPaneOpen: boolean
      lang: 'it' | 'en'
      /** Consumo stimato di questa sessione, per finestra. */
      sessionUse: Partial<Record<'five_hour' | 'seven_day', { resetsAt?: string; last: number; used: number }>>
      /** Turni di questa sessione in corso. */
      openTurns: number
      /** Fine dell'ultimo turno (ms), 0 = nessuno. */
      lastTurnEnd: number
      /** Chiave dello store con il registro dei costi di questa sessione ('' = non ancora). */
      sessionKey: string
      /** Ultimo costo totale della sessione visto (USD), -1 = nessuno. */
      lastCostUsd: number
      /** Quote di consumo per progetto nella finestra di 5 ore. */
      projectShare: StoredProjectShare | null
    }
  }
}
