// Usage Time Bar: affianca all'utilizzo reale dei limiti di 5 ore e 7 giorni la
// progressione temporale teorica della finestra. Legge i limiti dal motore e
// dal server (come il popup di Claude); non modifica richieste, quote né valori
// mostrati da Claude.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { StoredBreakdown, StoredContext, StoredCredit, StoredLimits, StoredProjectShare, StoredWindow } from '../types'
import { readConfig } from './lib/config'
import type { Config } from './lib/config'
import { dict, normalizeLang } from './lib/i18n'
import type { Lang } from './lib/i18n'
import {
  accessibleSummary,
  breakdownText,
  contextText,
  creditSummary,
  projectShareText,
  renderBand,
  renderEmptyCard,
  renderModeButton,
  sessionUseText,
  statusText,
} from './lib/ui'
import { aggregateProjects, appendCost, lastActivity, parseProjectLog, PROJECT_KEEP_MS, PROJECT_KEY_PREFIX, projectName } from './lib/projectUse'
import type { ProjectLog } from './lib/projectUse'
import { mergeWindows, parseServerExtras, parseServerUsage, retryAfterMs, USAGE_HEADERS, USAGE_URL } from './lib/serverUsage'
import type { ServerExtras } from './lib/serverUsage'
import { accrue, isSessionActive } from './lib/sessionUse'
import { describeWindows, pickWindows } from './lib/windows'
import type { WindowView } from './lib/windows'

const limits = atom({ plugin: 'usage-time-bar', key: 'limits' } as const, null)
const clockNow = atom({ plugin: 'usage-time-bar', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-time-bar', key: 'isHidden' } as const, false)
const isPaneOpen = atom({ plugin: 'usage-time-bar', key: 'isPaneOpen' } as const, false)
const lang = atom({ plugin: 'usage-time-bar', key: 'lang' } as const, 'it')
// Consumo stimato di questa sessione: aumenti dei limiti visti durante i suoi turni.
const sessionUse = atom({ plugin: 'usage-time-bar', key: 'sessionUse' } as const, {})
const openTurns = atom({ plugin: 'usage-time-bar', key: 'openTurns' } as const, 0)
const lastTurnEnd = atom({ plugin: 'usage-time-bar', key: 'lastTurnEnd' } as const, 0)
// Consumo per progetto: registro dei costi di questa sessione nello store, quote di tutte.
const sessionKey = atom({ plugin: 'usage-time-bar', key: 'sessionKey' } as const, '')
const lastCostUsd = atom({ plugin: 'usage-time-bar', key: 'lastCostUsd' } as const, -1)
const projectShare = atom({ plugin: 'usage-time-bar', key: 'projectShare' } as const, null)

/** Nome del progetto di questa sessione (cartella), fissato a session.start. */
let project = ''

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
const STORE_PROJECTS = 'projectShare'

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
  const { scoped, credits, extrasAt } = value as Partial<StoredLimits>
  if (typeof extrasAt === 'number') {
    stored.extrasAt = extrasAt
    stored.scoped = parseScoped(scoped)
    stored.credits = parseCredits(credits)
    stored.breakdown = parseBreakdown((value as Partial<StoredLimits>).breakdown)
  }

  return stored
}

function parseBreakdown(value: unknown): StoredBreakdown[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    const b = (item ?? {}) as Partial<StoredBreakdown>
    return typeof b.key === 'string' && typeof b.name === 'string' && typeof b.percent === 'number' && Number.isFinite(b.percent)
      ? [{ key: b.key, name: b.name, percent: b.percent }]
      : []
  })
}

/** Limiti di un modello salvati: come pickWindows, ma tengono il nome. */
function parseScoped(value: unknown): StoredWindow[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    const { name } = (item ?? {}) as Partial<StoredWindow>
    const [w] = pickWindows([item])
    return w !== undefined && typeof name === 'string' && name !== '' ? [{ ...w, label: name, name }] : []
  })
}

function parseCredits(value: unknown): StoredCredit[] {
  if (!Array.isArray(value)) return []
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

  return value.flatMap(item => {
    const c = (item ?? {}) as Partial<StoredCredit>
    if (typeof c.id !== 'string' || !ok(c.limit) || !ok(c.used) || !ok(c.remaining)) return []
    const credit: StoredCredit = { id: c.id, limit: c.limit!, used: c.used!, remaining: c.remaining!, currency: typeof c.currency === 'string' ? c.currency : 'USD' }
    if (typeof c.expiresAt === 'string') credit.expiresAt = c.expiresAt
    return [credit]
  })
}

/** Tutte le finestre da mostrare: 5 ore, settimanale, poi i limiti per modello. */
function viewsOf(stored: StoredLimits, now: number, config: Config): WindowView[] {
  return describeWindows([...stored.windows, ...(stored.scoped ?? [])], now, config.durations)
}

async function refreshStatus($: EngineInterface, config: Config) {
  if (!config.showStatus) return
  const stored = await read($, limits)
  if (stored === null) return $.ui.status(undefined)
  $.ui.status(statusText(viewsOf(stored, await $.clock.now(), config)))
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
  extras?: ServerExtras,
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
  // Limiti per modello e crediti: solo dal server; vince la lettura più recente.
  const newest = (saved?.extrasAt ?? 0) > (current?.extrasAt ?? 0) ? saved : current
  if (extras !== undefined) {
    next.scoped = extras.scoped
    next.credits = extras.credits
    next.breakdown = extras.breakdown
    next.extrasAt = now
  } else if (newest?.extrasAt !== undefined) {
    next.scoped = newest.scoped ?? []
    next.credits = newest.credits ?? []
    next.breakdown = newest.breakdown ?? []
    next.extrasAt = newest.extrasAt
  }
  if (current === null || JSON.stringify(next) !== JSON.stringify(current)) await update($, limits, () => next)
  await trackSession($, windows, now)
  if (
    saved === null ||
    sig !== signature(saved.windows) ||
    next.observedAt > saved.observedAt ||
    (next.extrasAt ?? 0) > (saved.extrasAt ?? 0)
  ) {
    await $.store.set(STORE_LIMITS, next)
  }
}

/** Conta gli aumenti dei limiti visti mentre questa sessione lavora. */
async function trackSession($: EngineInterface, windows: StoredLimits['windows'], now: number) {
  const active = isSessionActive(await read($, openTurns), await read($, lastTurnEnd), now)
  const prev = await read($, sessionUse)
  const next = accrue(prev, windows, active)
  if (JSON.stringify(next) !== JSON.stringify(prev)) await update($, sessionUse, () => next)
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
  if (windows.length > 0) await adopt($, windows, undefined, true, parseServerExtras(res.text))
  await refreshStatus($, config)
}

/**
 * Registra la spesa di questa sessione (aumento del costo totale dall'ultima
 * lettura) nella sua voce dello store, insieme al nome del progetto.
 */
async function recordCost($: EngineInterface, usd: number | undefined, now: number) {
  if (usd === undefined || !Number.isFinite(usd) || project === '') return
  const last = await read($, lastCostUsd)
  await update($, lastCostUsd, () => usd)
  // Prima lettura, o costo ripartito da zero (/clear): è il nuovo punto di partenza.
  if (last < 0 || usd < last) return
  const spent = usd - last
  if (spent <= 0) return
  let key = await read($, sessionKey)
  if (key === '') {
    key = `${PROJECT_KEY_PREFIX}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    await update($, sessionKey, () => key)
  }
  const saved = parseProjectLog(await $.store.get(key)) ?? { project, events: [] }
  await $.store.set(key, appendCost({ project, events: saved.events }, now, spent))
}

/**
 * Somma le voci di tutte le sessioni nella finestra di 5 ore attuale e ricava la
 * quota di ciascun progetto. Toglie le voci delle sessioni ferme da più di 6 ore.
 */
async function refreshProjects($: EngineInterface, now: number) {
  const stored = await read($, limits)
  const five = stored?.windows.find(w => w.kind === 'five_hour')
  const reset = five?.resetsAt === undefined ? NaN : Date.parse(five.resetsAt)
  // Inizio della finestra di 5 ore (dal reset), o le ultime 5 ore se non è noto.
  const from = Number.isFinite(reset) && reset > now ? reset - 5 * 3_600_000 : now - 5 * 3_600_000
  const own = await read($, sessionKey)
  const logs: ProjectLog[] = []
  for (const key of await $.store.keys()) {
    if (!key.startsWith(PROJECT_KEY_PREFIX)) continue
    const log = parseProjectLog(await $.store.get(key))
    if (log === undefined || (key !== own && now - lastActivity(log) > PROJECT_KEEP_MS)) {
      await $.store.delete(key)
      continue
    }
    logs.push(log)
  }
  const share: StoredProjectShare = aggregateProjects(logs, from)
  const prev = await read($, projectShare)
  if (JSON.stringify(prev?.rows) !== JSON.stringify(share.rows) || prev?.from !== share.from) {
    await update($, projectShare, () => share)
    // Anche per l'app nella barra di Windows, che legge lo store.
    await $.store.set(STORE_PROJECTS, share)
  }
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
    await recordCost($, usage.cost?.usd, await $.clock.now())
  } catch {
    // Lettura non disponibile in questo momento: unisco solo lo store.
  }
  try {
    await adopt($, windows, context)
  } catch {
    // Store illeggibile in questo istante: riprovo al prossimo giro.
  }
  const now = await $.clock.now()
  try {
    await refreshProjects($, now)
  } catch {
    // Store illeggibile in questo istante: riprovo al prossimo giro.
  }
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
    rows: 26,
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
    project = projectName(e.cwd)
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

  // Turni di questa sessione: gli aumenti dei limiti visti durante un turno (e
  // poco dopo) contano come consumo della sessione. Non blocca mai il turno.
  on('turn.start', async ($, e, next) => {
    await update($, openTurns, n => n + 1)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // Le esecuzioni dei subagenti non hanno turn.start: girano dentro il turno principale.
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    await update($, openTurns, n => Math.max(0, n - 1))
    await update($, lastTurnEnd, () => now)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits') || e.changed.includes('context')) {
      await remember($, config, e.rateLimits, e.context)
    }
    if (e.changed.includes('cost')) await recordCost($, e.cost?.usd, await $.clock.now())

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
      views: viewsOf(stored, now, config),
      credits: stored.credits,
      context: stored.context,
      now,
      observedAt: stored.observedAt,
      bodyColumns: e.props.bodyColumns,
      sessionUse: await read($, sessionUse),
      breakdown: stored.breakdown,
      projects: await read($, projectShare),
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
      views: viewsOf(stored, now, config),
      credits: stored.credits,
      context: stored.context,
      now,
      observedAt: stored.observedAt,
      bodyColumns: e.props.bodyColumns,
      isPane: true,
      sessionUse: await read($, sessionUse),
      breakdown: stored.breakdown,
      projects: await read($, projectShare),
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
      views: stored === null ? [] : viewsOf(stored, now, config),
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
    const lines = viewsOf(stored, now, config).map(view => accessibleSummary(view, now, undefined, l))
    for (const c of stored.credits ?? []) lines.push(creditSummary(c, now, undefined, l))
    const session = sessionUseText(await read($, sessionUse), l)
    if (session !== undefined) lines.push(`${session}.`)
    const split = breakdownText(stored.breakdown ?? [], l)
    if (split !== undefined) lines.push(`${split}.`)
    const projects = projectShareText(await read($, projectShare), l)
    if (projects !== undefined) lines.push(`${projects}.`)
    if (stored.context !== undefined) lines.unshift(d.contextOf(contextText(stored.context)))

    return { text: lines.join('\n') }
  })
}
