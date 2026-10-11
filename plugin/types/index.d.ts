export type StoredWindow = {
  kind: 'five_hour' | 'seven_day'
  label: string
  percentUsed: number
  resetsAt?: string
}

export type StoredContext = { tokens?: number; window: number; percent?: number }

export type StoredLimits = { observedAt: number; windows: StoredWindow[]; context?: StoredContext }

declare module 'claude-code' {
  interface PluginState {
    'usage-time-bar': {
      limits: StoredLimits | null
      now: number
      isHidden: boolean
      isPaneOpen: boolean
      lang: 'it' | 'en'
    }
  }
}
