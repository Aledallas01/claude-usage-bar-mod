// Configurazione: i campi `userConfig` di plugin.json, con valori di ripiego.

import type { PluginOptions } from 'claude-code'

import { DEFAULT_DURATIONS_MS } from './windows'
import type { WindowKind } from './windows'

export type Config = {
  /** 'auto' = lingua del sistema; 'it'/'en' = forzata. */
  language: 'auto' | 'it' | 'en'
  showBand: boolean
  showButton: boolean
  showStatus: boolean
  refreshSeconds: number
  durations: Record<WindowKind, number>
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export function readConfig(options: PluginOptions | undefined): Config {
  const o = options ?? {}

  return {
    language: o.language === 'it' || o.language === 'en' ? o.language : 'auto',
    showBand: o.showBand === true,
    showButton: o.showButton !== false,
    showStatus: o.showStatus === true,
    refreshSeconds: Math.max(5, positive(o.refreshSeconds, 30)),
    durations: {
      five_hour: positive(o.fiveHourWindowHours, 0) * 3_600_000 || DEFAULT_DURATIONS_MS.five_hour,
      seven_day: positive(o.sevenDayWindowDays, 0) * 86_400_000 || DEFAULT_DURATIONS_MS.seven_day,
    },
  }
}
