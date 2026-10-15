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

export type StoredLimits = {
  observedAt: number
  windows: StoredWindow[]
  context?: StoredContext
  /** Limiti di un singolo modello ("Settimanale · Fable"), solo dal server. */
  scoped?: StoredWindow[]
  credits?: StoredCredit[]
  /** Quando il server ha comunicato scoped/credits. */
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
    }
  }
}
