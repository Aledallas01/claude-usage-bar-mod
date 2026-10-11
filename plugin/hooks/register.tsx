// Usage Time Bar: affianca all'utilizzo reale dei limiti di 5 ore e 7 giorni la
// progressione temporale teorica della finestra. Legge soltanto i dati che il
// motore già riceve; non modifica richieste, quote né valori mostrati da Claude.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { StoredContext, StoredLimits } from '../types'
import { readConfig } from './lib/config'
import type { Config } from './lib/config'
import { dict, normalizeLang } from './lib/i18n'
import type { Lang } from './lib/i18n'
import { accessibleSummary, contextText, renderBand, renderEmptyCard, renderModeButton, statusText } from './lib/ui'
import { describeWindows, pickWindows } from './lib/windows'

const limits = atom({ plugin: 'usage-time-bar', key: 'limits' } as const, null)
const clockNow = atom({ plugin: 'usage-time-bar', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-time-bar', key: 'isHidden' } as const, false)
const isPaneOpen = atom({ plugin: 'usage-time-bar', key: 'isPaneOpen' } as const, false)
const lang = atom({ plugin: 'usage-time-bar', key: 'lang' } as const, 'it')

/**
 * Lingua dell'interfaccia. In ordine: scelta forzata in configurazione; lingua
 * del sistema (CurrentUICulture via PowerShell); variabili d'ambiente; Intl;
 * infine inglese. Rilevata una sola volta all'avvio.
 */
async function detectLang($: EngineInterface, config: Config): Promise<Lang> {
  if (config.language !== 'auto') return config.language
  try {
    const r = await $.process.run([
      'powershell',
      '-NoProfile',
      '-Command',
      '[System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName',
    ])
    const l = normalizeLang(r.stdout)
    if (l !== undefined) return l
  } catch {
    // niente PowerShell: provo le vie sotto.
  }
  try {
    const l = normalizeLang((await $.env.get('LC_ALL')) ?? (await $.env.get('LANG')))
    if (l !== undefined) return l
  } catch {
    // variabili d'ambiente non leggibili.
  }
  try {
    const l = normalizeLang(new Intl.DateTimeFormat().resolvedOptions().locale)
    if (l !== undefined) return l
  } catch {
    // Intl non disponibile.
  }

  return 'en'
}

const STORE_LIMITS = 'lastLimits'
const STORE_HIDDEN = 'isHidden'

function parseContext(value: unknown): StoredContext | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const { tokens, window, percent } = value as Partial<SessionContextUsage>
  if (typeof window !== 'number' || !Number.isFinite(window) || window <= 0) return undefined
  const context: StoredContext = { window }
  if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0) context.tokens = tokens
  if (typeof percent === 'number' && Number.isFinite(percent)) context.percent = percent

  return context
}

function parseStored(value: unknown): StoredLimits | null {
  if (value === null || typeof value !== 'object') return null
  const { observedAt, windows, context } = value as Partial<StoredLimits>
  if (typeof observedAt !== 'number' || !Array.isArray(windows)) return null
  const picked = pickWindows(windows)
  if (picked.length === 0) return null
  const stored: StoredLimits = { observedAt, windows: picked }
  const parsed = parseContext(context)
  if (parsed !== undefined) stored.context = parsed

  return stored
}

async function refreshStatus($: EngineInterface, config: Config) {
  if (!config.showStatus) return
  const stored = await read($, limits)
  if (stored === null) return $.ui.status(undefined)
  $.ui.status(statusText(describeWindows(stored.windows, await $.clock.now(), config.durations)))
}

/** Impronta delle finestre: dice se una lettura della sessione è davvero nuova. */
function signature(windows: StoredLimits['windows']): string {
  return JSON.stringify(windows.map(w => [w.kind, w.percentUsed, w.resetsAt ?? null]))
}

// Ultima lettura dei limiti arrivata a questa sessione dal motore. Una lettura
// uguale alla precedente non è un dato nuovo: rimetterla nello store con l'ora
// attuale cancellerebbe un dato più recente scritto da un'altra sessione.
let lastOwnSignature: string | undefined

async function remember(
  $: EngineInterface,
  config: Config,
  rateLimits: readonly SessionRateLimit[],
  context: SessionContextUsage | undefined,
) {
  // Il contesto è della sessione viva, mai quello salvato da un'altra.
  const parsed = parseContext(context)
  const ownContext = parsed !== undefined && parsed.tokens !== undefined ? parsed : undefined
  const windows = pickWindows(rateLimits)
  const sig = signature(windows)
  if (windows.length > 0 && sig !== lastOwnSignature) {
    lastOwnSignature = sig
    const stored: StoredLimits = { observedAt: await $.clock.now(), windows }
    if (ownContext !== undefined) stored.context = ownContext
    await update($, limits, () => stored)
    await $.store.set(STORE_LIMITS, stored)
  } else if (ownContext !== undefined) {
    // Solo il contesto è cambiato: i limiti restano i più recenti noti.
    await update($, limits, current => (current === null ? null : { ...current, context: ownContext }))
  }
  await refreshStatus($, config)
}

/**
 * Tempo reale tra sessioni: i limiti sono dell'account, non della sessione.
 * Se un'altra sessione (un'altra scheda Code, un terminale) ha salvato una
 * lettura più recente, questa la adotta subito, senza attendere la prossima
 * risposta di Claude. Il contesto resta quello di questa sessione.
 */
async function syncFromStore($: EngineInterface) {
  const saved = parseStored(await $.store.get(STORE_LIMITS))
  if (saved === null) return
  await update($, limits, current => {
    if (current !== null && saved.observedAt <= current.observedAt) return current
    const adopted: StoredLimits = { observedAt: saved.observedAt, windows: saved.windows }
    if (current?.context !== undefined) adopted.context = current.context

    return adopted
  })
}

async function tick($: EngineInterface, config: Config) {
  try {
    const usage = await $.session.usage()
    await remember($, config, usage.rateLimits, usage.context)
  } catch {
    // Lettura non disponibile in questo momento: riprovo al prossimo giro.
  }
  try {
    await syncFromStore($)
  } catch {
    // Store illeggibile in questo istante: riprovo al prossimo giro.
  }
  const now = await $.clock.now()
  await update($, clockNow, () => now)
  await refreshStatus($, config)
}

// Apre il riquadro come un popup: prende la tastiera (focus), così il motore
// avvisa quando il focus la lascia (clic fuori) e Esc lo chiude.
async function openPane($: EngineInterface) {
  const opened = await $.ui.open({
    id: 'usage-time',
    title: 'Limiti di utilizzo · ritmo',
    focus: true,
    closeOnEscape: true,
    columns: 58,
    rows: 10,
  })
  await update($, isPaneOpen, () => opened.isPlaced)
}

async function closePane($: EngineInterface) {
  await $.ui.close({ id: 'usage-time' })
  await update($, isPaneOpen, () => false)
}

export const register: Register = (on, options) => {
  const config = readConfig(options)

  on('session.start', async ($, e, next) => {
    const detected = await detectLang($, config)
    await update($, lang, () => detected)
    const d = dict(detected)
    await $.command.register({
      name: 'usage-time',
      description: d.cmdDescription,
      argumentHint: d.cmdArgHint,
    })
    try {
      await syncFromStore($)
    } catch {
      // Nessun dato salvato leggibile: arriverà con session.measure.
    }
    // Dopo un ricaricamento l'impronta riparte da ciò che è già mostrato, così
    // una lettura vecchia della sessione non scavalca un dato più recente.
    const shown = await read($, limits)
    if (shown !== null) lastOwnSignature = signature(shown.windows)
    // La fascia segue la scelta salvata con /usage-time mostra|nascondi, se c'è.
    const saved = await $.store.get(STORE_HIDDEN)
    const hidden = typeof saved === 'boolean' ? saved : !config.showBand
    await update($, isHidden, () => hidden)
    await update($, isPaneOpen, () => false)
    // Prima lettura subito (session.usage + store), poi a ogni giro.
    await tick($, config)
    $.clock.every(config.refreshSeconds * 1000, () => void tick($, config))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits') || e.changed.includes('context')) {
      await remember($, config, e.rateLimits, e.context)
    }

    return next(e)
  })

  // Fascia fissa sopra il prompt, solo se l'utente l'ha chiesta (/usage-time
  // mostra, o showBand). Il popup vero e proprio è il riquadro qui sotto.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'terminal') return next(e)
    if (await read($, isHidden)) return next(e)
    const stored = await read($, limits)
    if (stored === null) return next(e)
    const now = (await read($, clockNow)) || (await $.clock.now())

    return renderBand({
      surface: e.surface,
      elements: $.ui.resolve(e),
      lang: await read($, lang),
      views: describeWindows(stored.windows, now, config.durations),
      context: stored.context,
      now,
      observedAt: stored.observedAt,
      bodyColumns: e.props.bodyColumns,
    })
  })

  // Il riquadro-popup: stessa scheda, ma dentro un pane che prende la tastiera.
  on('ui.render', { component: 'Pane', requestId: 'usage-time' }, async ($, e) => {
    const elements = $.ui.resolve(e) as Elements['desktop'] | Elements['terminal']
    const onClose = () => void closePane($)
    const l = await read($, lang)
    const stored = await read($, limits)
    if (stored === null) return renderEmptyCard(elements, l, e.props.bodyColumns, onClose, true)
    const now = (await read($, clockNow)) || (await $.clock.now())

    return renderBand({
      surface: e.surface,
      elements,
      lang: l,
      views: describeWindows(stored.windows, now, config.durations),
      context: stored.context,
      now,
      observedAt: stored.observedAt,
      bodyColumns: e.props.bodyColumns,
      isPane: true,
      onClose,
    })
  })

  // Clic fuori dal riquadro (il focus lo lascia) → chiudi. In caso d'errore
  // lascia comunque muovere il focus: non deve mai intrappolare la tastiera.
  on('ui.focus', { component: 'Pane', requestId: 'usage-time' }, async ($, e, next) => {
    if (e.element === undefined) await closePane($)

    return next(e)
  }).catch(($, e, next) => next(e))

  // Chiusura dal motore (Esc, segno di chiusura): allinea lo stato, e non
  // impedire mai la chiusura.
  on('ui.close', async ($, e, next) => {
    if (e.id === 'usage-time') await update($, isPaneOpen, () => false)

    return next(e)
  }).catch(($, e, next) => next(e))

  // Il pulsante nel piede del prompt, accanto all'indicatore dei limiti.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!config.showButton) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'terminal') return next(e)
    const stored = await read($, limits)
    const now = (await read($, clockNow)) || (await $.clock.now())
    const open = await read($, isPaneOpen)

    return renderModeButton({
      elements: $.ui.resolve(e),
      lang: await read($, lang),
      modes: e.props.modes,
      views: stored === null ? [] : describeWindows(stored.windows, now, config.durations),
      isOpen: open,
      onPress: () => void (open ? closePane($) : openPane($)),
    })
  })

  on('command.run', { command: 'usage-time' }, async ($, e) => {
    const d = dict(await read($, lang))
    const arg = e.args.trim().toLowerCase()
    if (arg === 'nascondi' || arg === 'hide') {
      await update($, isHidden, () => true)
      await closePane($)
      await $.store.set(STORE_HIDDEN, true)
      await refreshStatus($, config)

      return { text: d.cmdHiddenOk }
    }
    if (arg === 'mostra' || arg === 'show') {
      await update($, isHidden, () => false)
      await $.store.set(STORE_HIDDEN, false)
      await refreshStatus($, config)
    }
    if (arg === '') await openPane($)
    const l = await read($, lang)
    const stored = await read($, limits)
    if (stored === null) return { text: d.cmdNoData }
    const now = await $.clock.now()
    const lines = describeWindows(stored.windows, now, config.durations).map(view => accessibleSummary(view, now, undefined, l))
    if (stored.context !== undefined) lines.unshift(d.contextOf(contextText(stored.context)))

    return { text: lines.join('\n') }
  })
}
