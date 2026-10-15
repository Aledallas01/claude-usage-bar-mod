// Lingua dell'interfaccia: rilevata automaticamente (italiano o inglese).
// Aggiungere una lingua = aggiungere una voce a DICTS e a LOCALES.

import type { WindowKind } from './windows'

export type Lang = 'it' | 'en'

export const LOCALES: Record<Lang, string> = { it: 'it-IT', en: 'en-US' }

/** Mappa un tag di lingua qualsiasi ("it-IT", "en_US.UTF-8") a una lingua nota. */
export function normalizeLang(raw: string | undefined | null): Lang | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const s = raw.trim().toLowerCase()
  if (s.startsWith('it')) return 'it'
  if (s.startsWith('en')) return 'en'

  return undefined
}

export type Dict = {
  windowLabel: Record<WindowKind, string>
  /** Limite di un singolo modello: "Settimanale · Fable". */
  scopedLabel: Record<WindowKind, (name: string) => string>
  creditsTitle: string
  creditsRemaining: (remaining: string, limit: string) => string
  creditsExpires: (when: string) => string
  cardTitle: string
  contextTitle: string
  usageReal: (pct: string) => string
  tooltipUsage: string
  tooltipTime: string
  tooltipOver: (pct: string) => string
  tooltipUnder: (pct: string) => string
  resetsInShort: (dur: string, when: string) => string
  contextTooltip: (text: string) => string
  resetsIn: (dur: string) => string
  resetsAtWhen: (when: string) => string
  resetNotReported: string
  alreadyReset: string
  lessThanMinute: string
  /** unità di durata: giorni, ore, minuti (sigle) */
  unit: { d: string; h: string; m: string }
  elapsed: (pct: string, estimated: boolean) => string
  estimateUnavailable: (reason: string) => string
  resetPassedWaiting: (when: string) => string
  reason: Record<string, string>
  paceEven: string
  paceAhead: (pts: number) => string
  paceBehind: (pts: number) => string
  legend: (isDesktop: boolean, when: string) => string
  emptyData: string
  modeFallback: string
  // dato ufficiale / stima, per il testo accessibile e il comando
  official: string
  theoretical: string
  pace: string
  contextOf: (text: string) => string
  /** "Questa sessione: 5 ore +6% · settimanale +1% (stima)" */
  sessionUse: (parts: string) => string
  sessionKind: Record<WindowKind, string>
  // comando /usage-time
  cmdDescription: string
  cmdArgHint: string
  cmdHiddenOk: string
  cmdNoData: string
}

const DICTS: Record<Lang, Dict> = {
  it: {
    windowLabel: { five_hour: 'Limite di sessione', seven_day: 'Settimanale · tutti i modelli' },
    scopedLabel: { five_hour: name => `Sessione · ${name}`, seven_day: name => `Settimanale · ${name}` },
    creditsTitle: 'Crediti per sessioni cloud',
    creditsRemaining: (remaining, limit) => `${remaining} di ${limit} rimanenti`,
    creditsExpires: when => `Scade ${when}`,
    cardTitle: 'Limiti di utilizzo del piano · ritmo',
    contextTitle: 'Finestra di contesto',
    usageReal: pct => `Utilizzo reale ${pct}`,
    tooltipUsage: 'valore ufficiale mostrato da Claude',
    tooltipTime: 'progressione teorica calcolata dalla mod, non è consumo',
    tooltipOver: pct => `Sopra il ritmo: ${pct} usato più del tempo trascorso`,
    tooltipUnder: pct => `Sotto il ritmo: ${pct} di margine rispetto al tempo trascorso`,
    resetsInShort: (dur, when) => `reset tra ${dur} (${when})`,
    contextTooltip: text => `Finestra di contesto: ${text} — dato del motore`,
    resetsIn: dur => `Si ripristina tra ${dur}`,
    resetsAtWhen: when => `Si azzera ${when}`,
    resetNotReported: 'reset non comunicato',
    alreadyReset: 'già ripristinato',
    lessThanMinute: 'meno di 1 min',
    unit: { d: 'g', h: 'h', m: 'min' },
    elapsed: (pct, estimated) => `Tempo trascorso ${pct}${estimated ? ' (stimato)' : ''}`,
    estimateUnavailable: reason => `Stima non disponibile (${reason})`,
    resetPassedWaiting: when => `Reset già avvenuto (${when}): in attesa di dati aggiornati`,
    reason: {
      'invalid-now': 'ora corrente non valida',
      'missing-reset': 'orario di reset non comunicato',
      'unknown-duration': 'durata della finestra sconosciuta',
      'invalid-window': 'orari della finestra non validi',
    },
    paceEven: 'in linea con il ritmo',
    paceAhead: pts => `${pts} pt sopra il ritmo`,
    paceBehind: pts => `${pts} pt sotto il ritmo`,
    legend: (isDesktop, when) =>
      `${isDesktop ? 'Blu' : '█'} = utilizzo reale (Claude) · verde/rosso = sotto/sopra il ritmo · ${
        isDesktop ? 'tacca' : 'colore'
      } = tempo trascorso (non è consumo) · dati delle ${when}`,
    emptyData: 'Nessun dato sui limiti ancora ricevuto: compare dopo la prima risposta di Claude.',
    modeFallback: 'Ritmo limiti',
    official: 'dato ufficiale di Claude',
    theoretical: 'progressione temporale teorica, calcolata dalla mod',
    pace: 'Ritmo',
    contextOf: text => `Finestra di contesto: ${text} (dato del motore).`,
    sessionUse: parts => `Questa sessione: ${parts} (stima)`,
    sessionKind: { five_hour: '5 ore', seven_day: 'settimanale' },
    cmdDescription: 'Utilizzo reale e tempo trascorso dei limiti di 5 ore e 7 giorni',
    cmdArgHint: '[mostra|nascondi|dettagli]',
    cmdHiddenOk: 'Fascia fissa nascosta. Usa /usage-time per il popup o /usage-time mostra per la fascia.',
    cmdNoData: 'Nessun dato sui limiti ancora ricevuto in questa sessione: compare dopo la prima risposta di Claude.',
  },
  en: {
    windowLabel: { five_hour: 'Session limit', seven_day: 'Weekly · all models' },
    scopedLabel: { five_hour: name => `Session · ${name}`, seven_day: name => `Weekly · ${name}` },
    creditsTitle: 'Cloud session credits',
    creditsRemaining: (remaining, limit) => `${remaining} of ${limit} remaining`,
    creditsExpires: when => `Expires ${when}`,
    cardTitle: 'Plan usage limits · pace',
    contextTitle: 'Context window',
    usageReal: pct => `Real usage ${pct}`,
    tooltipUsage: 'official value shown by Claude',
    tooltipTime: 'theoretical progression computed by the mod, not usage',
    tooltipOver: pct => `Ahead of pace: ${pct} more used than time elapsed`,
    tooltipUnder: pct => `Behind pace: ${pct} margin vs time elapsed`,
    resetsInShort: (dur, when) => `resets in ${dur} (${when})`,
    contextTooltip: text => `Context window: ${text} — engine value`,
    resetsIn: dur => `Resets in ${dur}`,
    resetsAtWhen: when => `Resets ${when}`,
    resetNotReported: 'reset not reported',
    alreadyReset: 'already reset',
    lessThanMinute: 'less than 1 min',
    unit: { d: 'd', h: 'h', m: 'm' },
    elapsed: (pct, estimated) => `Time elapsed ${pct}${estimated ? ' (estimated)' : ''}`,
    estimateUnavailable: reason => `Estimate unavailable (${reason})`,
    resetPassedWaiting: when => `Already reset (${when}): waiting for fresh data`,
    reason: {
      'invalid-now': 'current time invalid',
      'missing-reset': 'reset time not reported',
      'unknown-duration': 'window duration unknown',
      'invalid-window': 'window times invalid',
    },
    paceEven: 'on pace',
    paceAhead: pts => `${pts} pts ahead of pace`,
    paceBehind: pts => `${pts} pts behind pace`,
    legend: (isDesktop, when) =>
      `${isDesktop ? 'Blue' : '█'} = real usage (Claude) · green/red = behind/ahead of pace · ${
        isDesktop ? 'tick' : 'color'
      } = time elapsed (not token usage) · data as of ${when}`,
    emptyData: "No usage data yet: it appears after Claude's first reply.",
    modeFallback: 'Limits pace',
    official: "Claude's official value",
    theoretical: 'theoretical time progression, computed by the mod',
    pace: 'Pace',
    contextOf: text => `Context window: ${text} (engine value).`,
    sessionUse: parts => `This session: ${parts} (estimate)`,
    sessionKind: { five_hour: '5-hour', seven_day: 'weekly' },
    cmdDescription: 'Real usage and time elapsed for the 5-hour and 7-day limits',
    cmdArgHint: '[show|hide|details]',
    cmdHiddenOk: 'Fixed band hidden. Use /usage-time for the popup or /usage-time show for the band.',
    cmdNoData: "No usage data received this session yet: it appears after Claude's first reply.",
  },
}

export function dict(lang: Lang): Dict {
  return DICTS[lang]
}
