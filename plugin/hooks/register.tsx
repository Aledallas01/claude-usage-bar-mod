// Usage Time Bar: affianca all'utilizzo reale dei limiti di 5 ore e 7 giorni la
// progressione temporale teorica della finestra. Legge i limiti dal motore e
// dal server (come il popup di Claude); non modifica richieste, quote né valori
// mostrati da Claude.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { StoredContext, StoredLimits } from '../types'
import { readConfig } from './lib/config'
import type { Config } from './lib/config'
import { dict, normalizeLang } from './lib/i18n'
import type { Lang } from './lib/i18n'
import { accessibleSummary, contextText, renderBand, renderEmptyCard, renderModeButton, statusText } from './lib/ui'
import { mergeWindows, parseServerUsage, retryAfterMs, USAGE_HEADERS, USAGE_URL } from './lib/serverUsage'
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
const STORE_SERVER_AT = 'serverFetchedAt'
const STORE_SERVER_STATUS = 'serverStatus'
const STORE_SERVER_BACKOFF = 'serverBackoff'

/** Pausa dopo un rifiuto del server (429/5xx): raddoppia fino a 30 minuti. */
const BACKOFF_MIN_MS = 2 * 60_000
const BACKOFF_MAX_MS = 30 * 60_000

type Backoff = { until: number; delayMs: number }

function parseBackoff(value: unknown): Backoff | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const { until, delayMs } = value as Partial<Backoff>

  return typeof until === 'number' && typeof delayMs === 'number' ? { until, delayMs } : undefined
}

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

function signature(windows: StoredLimits['windows']): string {
  return JSON.stringify(windows.map(w => [w.kind, w.percentUsed, w.resetsAt ?? null]))
}

/**
 * Unisce una lettura (`incoming`) a quella mostrata e a quella salvata dalle
 * altre sessioni, finestra per finestra (mergeWindows: dentro una finestra
 * vince l'utilizzo più alto, quindi una fonte in ritardo non riporta indietro
 * la percentuale). `isFresh`: lettura appena confermata dal server, che
 * aggiorna l'ora del dato anche se i valori non cambiano.
 */
async function adopt(
  $: EngineInterface,
  incoming: StoredLimits['windows'],
  ownContext: StoredContext | undefined,
  isFresh = false,
) {
  let saved: StoredLimits | null = null
  try {
    saved = parseStored(await $.store.get(STORE_LIMITS))
  } catch {
    // Store illeggibile in questo istante: unisco solo ciò che ho.
  }
  const current = await read($, limits)
  const windows = mergeWindows(mergeWindows(current?.windows ?? [], saved?.windows ?? []), incoming)
  if (windows.length === 0) return
  const sig = signature(windows)
  const now = await $.clock.now()
  // Ora del dato: adesso se porta qualcosa che lo store non ha ancora (o se il
  // server l'ha appena confermato), altrimenti quella già nota.
  const isNew = isFresh || saved === null || sig !== signature(saved.windows)
  const known = Math.max(current?.observedAt ?? 0, saved?.observedAt ?? 0)
  const next: StoredLimits = { observedAt: isNew ? now : known, windows }
  // Il contesto è della sessione viva, mai quello salvato da un'altra.
  const context = ownContext ?? current?.context
  if (context !== undefined) next.context = context
  if (current === null || JSON.stringify(next) !== JSON.stringify(current)) await update($, limits, () => next)
  if (saved === null || sig !== signature(saved.windows) || next.observedAt > saved.observedAt) {
    await $.store.set(STORE_LIMITS, next)
  }
}

function ownContextOf(context: SessionContextUsage | undefined): StoredContext | undefined {
  const parsed = parseContext(context)

  return parsed !== undefined && parsed.tokens !== undefined ? parsed : undefined
}

async function remember(
  $: EngineInterface,
  config: Config,
  rateLimits: readonly SessionRateLimit[],
  context: SessionContextUsage | undefined,
) {
  await adopt($, pickWindows(rateLimits), ownContextOf(context))
  await refreshStatus($, config)
}

/**
 * Legge i limiti dal server, come fa il popup di Claude: si aggiornano anche
 * senza risposte e includono il consumo da claude.ai. Tra più sessioni aperte
 * interroga una sola volta per intervallo; le altre lo prendono dallo store.
 */
async function fetchServer($: EngineInterface, config: Config) {
  if (config.serverRefreshSeconds === 0) return
  const now = await $.clock.now()
  const last = await $.store.get(STORE_SERVER_AT)
  if (typeof last === 'number' && now - last < config.serverRefreshSeconds * 900) return
  const backoff = parseBackoff(await $.store.get(STORE_SERVER_BACKOFF))
  if (backoff !== undefined && now < backoff.until) return
  await $.store.set(STORE_SERVER_AT, now)
  const auth = await $.session.authorize()
  if (auth === null || auth.kind !== 'bearer') {
    await $.store.set(STORE_SERVER_STATUS, { at: now, error: 'nessun accesso con abbonamento' })
    return
  }
  const res = await $.http.fetch(USAGE_URL, { headers: USAGE_HEADERS, auth: auth.handle })
  await $.store.set(STORE_SERVER_STATUS, { at: now, status: res.status })
  if (res.status === 429 || res.status >= 500) {
    // Il server chiede di rallentare: aspetto quanto dice, o raddoppio la pausa.
    const delayMs = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, (backoff?.delayMs ?? BACKOFF_MIN_MS / 2) * 2))
    const wait = retryAfterMs(res.headers['retry-after'], now) ?? delayMs
    await $.store.set(STORE_SERVER_BACKOFF, { until: now + Math.min(BACKOFF_MAX_MS, wait), delayMs })
    return
  }
  if (backoff !== undefined) await $.store.delete(STORE_SERVER_BACKOFF)
  if (!res.ok) return
  // Risposta grezza (solo percentuali e date, nessuna credenziale): serve a
  // leggere i campi che la mod non interpreta ancora.
  await $.store.set('serverRaw', res.text.slice(0, 20_000))
  const windows = pickWindows(parseServerUsage(res.text))
  if (windows.length > 0) await adopt($, windows, undefined, true)
  await refreshStatus($, config)
}

async function tick($: EngineInterface, config: Config) {
  // Una sola unione per giro: la lettura della sessione (se c'è) più quella
  // salvata dalle altre sessioni e dal server.
  let windows: StoredLimits['windows'] = []
  let context: StoredContext | undefined
  try {
    const usage = await $.session.usage()
    windows = pickWindows(usage.rateLimits)
    context = ownContextOf(usage.context)
  } catch {
    // Lettura non disponibile in questo momento: unisco solo lo store.
  }
  try {
    await adopt($, windows, context)
  } catch {
    // Store illeggibile in questo istante: riprovo al prossimo giro.
  }
  const now = await $.clock.now()
  await update($, clockNow, () => now)
  await refreshStatus($, config)
}

async function serverTick($: EngineInterface, config: Config) {
  try {
    await fetchServer($, config)
  } catch (err) {
    try {
      await $.store.set(STORE_SERVER_STATUS, { at: await $.clock.now(), error: String(err).slice(0, 200) })
    } catch {
      // niente da fare: riprovo al prossimo intervallo.
    }
  }
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
    // La fascia segue la scelta salvata con /usage-time mostra|nascondi, se c'è.
    const saved = await $.store.get(STORE_HIDDEN)
    const hidden = typeof saved === 'boolean' ? saved : !config.showBand
    await update($, isHidden, () => hidden)
    await update($, isPaneOpen, () => false)
    // Prima lettura subito (session.usage + store), poi a ogni giro.
    await tick($, config)
    $.clock.every(config.refreshSeconds * 1000, () => void tick($, config))
    if (config.serverRefreshSeconds > 0) {
      void serverTick($, config)
      $.clock.every(config.serverRefreshSeconds * 1000, () => void serverTick($, config))
    }

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
