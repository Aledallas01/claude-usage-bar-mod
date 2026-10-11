// Usage Time Bar: affianca all'utilizzo reale dei limiti di 5 ore e 7 giorni la
// progressione temporale teorica della finestra. Legge soltanto i dati che il
// motore già riceve; non modifica richieste, quote né valori mostrati da Claude.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { StoredContext, StoredLimits } from '../types'
import { readConfig } from './lib/config'
import type { Config } from './lib/config'
import { accessibleSummary, contextText, renderBand, renderEmptyCard, renderModeButton, statusText } from './lib/ui'
import { describeWindows, pickWindows } from './lib/windows'

const limits = atom({ plugin: 'usage-time-bar', key: 'limits' } as const, null)
const clockNow = atom({ plugin: 'usage-time-bar', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-time-bar', key: 'isHidden' } as const, false)
const isPaneOpen = atom({ plugin: 'usage-time-bar', key: 'isPaneOpen' } as const, false)

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

async function remember(
  $: EngineInterface,
  config: Config,
  rateLimits: readonly SessionRateLimit[],
  context: SessionContextUsage | undefined,
) {
  const windows = pickWindows(rateLimits)
  if (windows.length === 0) return
  const stored: StoredLimits = { observedAt: await $.clock.now(), windows }
  // Il contesto è della sessione viva, mai quello salvato da una precedente.
  const parsed = parseContext(context)
  if (parsed !== undefined && parsed.tokens !== undefined) stored.context = parsed
  await update($, limits, () => stored)
  await $.store.set(STORE_LIMITS, stored)
  await refreshStatus($, config)
}

async function tick($: EngineInterface, config: Config) {
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
    await $.command.register({
      name: 'usage-time',
      description: 'Utilizzo reale e tempo trascorso dei limiti di 5 ore e 7 giorni',
      argumentHint: '[mostra|nascondi|dettagli]',
    })
    if ((await read($, limits)) === null) {
      const saved = parseStored(await $.store.get(STORE_LIMITS))
      if (saved !== null) await update($, limits, () => saved)
    }
    // La fascia segue la scelta salvata con /usage-time mostra|nascondi, se c'è.
    const saved = await $.store.get(STORE_HIDDEN)
    const hidden = typeof saved === 'boolean' ? saved : !config.showBand
    await update($, isHidden, () => hidden)
    await update($, isPaneOpen, () => false)
    try {
      const usage = await $.session.usage()
      await remember($, config, usage.rateLimits, usage.context)
    } catch {
      // Nessuna lettura ancora disponibile: arriverà con session.measure.
    }
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
    const stored = await read($, limits)
    if (stored === null) return renderEmptyCard(elements, e.props.bodyColumns, onClose, true)
    const now = (await read($, clockNow)) || (await $.clock.now())

    return renderBand({
      surface: e.surface,
      elements,
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
      modes: e.props.modes,
      views: stored === null ? [] : describeWindows(stored.windows, now, config.durations),
      isOpen: open,
      onPress: () => void (open ? closePane($) : openPane($)),
    })
  })

  on('command.run', { command: 'usage-time' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'nascondi' || arg === 'hide') {
      await update($, isHidden, () => true)
      await closePane($)
      await $.store.set(STORE_HIDDEN, true)
      await refreshStatus($, config)

      return { text: 'Fascia fissa nascosta. Usa /usage-time per il popup o /usage-time mostra per la fascia.' }
    }
    if (arg === 'mostra' || arg === 'show') {
      await update($, isHidden, () => false)
      await $.store.set(STORE_HIDDEN, false)
      await refreshStatus($, config)
    }
    if (arg === '') await openPane($)
    const stored = await read($, limits)
    if (stored === null) {
      return {
        text: 'Nessun dato sui limiti ancora ricevuto in questa sessione: compare dopo la prima risposta di Claude.',
      }
    }
    const now = await $.clock.now()
    const lines = describeWindows(stored.windows, now, config.durations).map(view => accessibleSummary(view, now))
    if (stored.context !== undefined) lines.unshift(`Finestra di contesto: ${contextText(stored.context)} (dato del motore).`)

    return { text: lines.join('\n') }
  })
}
