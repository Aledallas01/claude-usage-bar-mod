// Modulo di integrazione con la UI: disegna le due barre (utilizzo reale +
// progressione temporale teorica) con gli elementi della superficie.

import type { Elements, RenderElement } from 'claude-code'

import { dict, LOCALES } from './i18n'
import type { Lang } from './i18n'
import type { Credit } from './serverUsage'
import { roundUse } from './sessionUse'
import type { SessionUse } from './sessionUse'
import type { Breakdown } from './serverUsage'
import type { ProjectShare } from './projectUse'
import { formatDuration, formatPercent, formatResetTime, toEpochMs } from './timeWindow'
import type { WindowView } from './windows'

/** Nome della finestra come nel popup di Claude ("Settimanale · Fable"). */
export function windowName(view: WindowView, lang: Lang = 'it'): string {
  const d = dict(lang)

  return view.name === undefined ? d.windowLabel[view.kind] : d.scopedLabel[view.kind](view.name)
}

/** Etichetta corta per pulsante e riga di stato: "5h", "7d", "Fable". */
export function shortName(view: WindowView): string {
  if (view.name !== undefined) return view.name

  return view.kind === 'five_hour' ? '5h' : '7d'
}

/** Chiave stabile di una finestra nella scheda. */
function windowKey(view: WindowView): string {
  return view.name === undefined ? `win-${view.kind}` : `win-${view.kind}-${view.name}`
}

/** "250 USD", "12,50 USD". */
export function formatMoney(amount: number, currency: string, lang: Lang = 'it'): string {
  const n = new Intl.NumberFormat(LOCALES[lang], {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)

  return `${n} ${currency}`
}

/** "250 USD di 250 USD rimanenti", come nel popup di Claude. */
export function creditRemainingText(c: Credit, lang: Lang = 'it'): string {
  return dict(lang).creditsRemaining(formatMoney(c.remaining, c.currency, lang), formatMoney(c.limit, c.currency, lang))
}

/** "Scade 5 nov 08:59" (data e ora locali). */
export function creditExpiryText(c: Credit, now: number, timeZone?: string, lang: Lang = 'it'): string | undefined {
  const at = toEpochMs(c.expiresAt)
  if (at === undefined) return undefined

  return dict(lang).creditsExpires(formatResetTime(at, now, timeZone, lang))
}

/** Frase completa dei crediti per il comando e i lettori di schermo. */
export function creditSummary(c: Credit, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const expiry = creditExpiryText(c, now, timeZone, lang)

  return `${dict(lang).creditsTitle}: ${creditRemainingText(c, lang)}${expiry === undefined ? '' : ` · ${expiry}`}.`
}

/** Scarto (punti percentuali) oltre il quale il ritmo è segnalato. */
const PACE_TOLERANCE = 5

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`)
}

export type Pace = 'ahead' | 'behind' | 'even' | undefined

/** Confronto tra consumo reale e tempo trascorso, solo se la stima è valida. */
export function paceOf(view: WindowView): Pace {
  if (!view.time.ok || view.time.isResetPassed) return undefined
  const diff = view.percentUsed - view.time.elapsedPercent
  if (diff > PACE_TOLERANCE) return 'ahead'
  if (diff < -PACE_TOLERANCE) return 'behind'

  return 'even'
}

/** Margine (punti) entro cui "sotto il ritmo" è ancora da tenere d'occhio. */
export const PACE_MARGIN = 5

export type PaceColor = 'error' | 'warning' | 'success'

/**
 * Colore del ritmo: rosso se l'utilizzo supera il tempo trascorso (sei sopra
 * dove dovresti essere), arancione se sei sotto di 0–5 punti, verde se sei
 * sotto di più di 5 punti. Allo 0% non hai consumato nulla: sempre verde.
 */
export function paceColor(view: WindowView): PaceColor | undefined {
  if (!view.time.ok || view.time.isResetPassed) return undefined
  if (view.percentUsed <= 0) return 'success'
  const diff = view.percentUsed - view.time.elapsedPercent
  if (diff > 0) return 'error'
  if (diff >= -PACE_MARGIN) return 'warning'

  return 'success'
}

/** Classe SVG del tratto tra utilizzo e tempo, con lo stesso colore del ritmo. */
function deltaClass(view: WindowView, delta: Delta): string {
  return delta.kind === 'under' && paceColor(view) === 'warning' ? 'near' : delta.kind
}

export function usageText(view: WindowView, lang: Lang = 'it'): string {
  return dict(lang).usageReal(formatPercent(view.percentUsed))
}

export function timeText(view: WindowView, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const d = dict(lang)
  const t = view.time
  if (!t.ok) return d.estimateUnavailable(d.reason[t.reason] ?? t.reason)
  if (t.isResetPassed) return d.resetPassedWaiting(formatResetTime(t.resetAt, now, timeZone, lang))

  return `${d.elapsed(formatPercent(t.elapsedPercent), t.isStartDerived)} · ${d.resetsInShort(
    formatDuration(t.remainingMs, lang),
    formatResetTime(t.resetAt, now, timeZone, lang),
  )}`
}

export function paceText(pace: Pace, view: WindowView, lang: Lang = 'it'): string | undefined {
  if (pace === undefined || !view.time.ok) return undefined
  const d = dict(lang)
  const diff = Math.round(Math.abs(view.percentUsed - view.time.elapsedPercent))
  if (pace === 'ahead') return d.paceAhead(diff)
  if (pace === 'behind') return d.paceBehind(diff)

  return d.paceEven
}

/** Frase completa per lettori di schermo, tooltip e comando /usage-time. */
export function accessibleSummary(view: WindowView, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const d = dict(lang)
  const pace = paceText(paceOf(view), view, lang)
  const label = windowName(view, lang)

  return `${label}: ${usageText(view, lang)} (${d.official}). ${timeText(view, now, timeZone, lang)}${
    view.time.ok && !view.time.isResetPassed ? ` (${d.theoretical})` : ''
  }.${pace ? ` ${d.pace}: ${pace}.` : ''}`
}

/**
 * SVG della barra per desktop, nello stile del popup dei limiti di Claude: barra
 * sottile blu (utilizzo reale), tratto verde/rosso fino al ritmo, tacca sul
 * tempo trascorso. Larga 1000 per riempire lo spazio: il desktop la riduce.
 */
export function barSvg(view: WindowView, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const d = dict(lang)
  const W = 400
  const usage = Math.min(100, Math.max(0, view.percentUsed))
  const t = view.time
  const hasTime = t.ok && !t.isResetPassed
  const elapsed = hasTime ? t.elapsedPercent : 0
  const x = (pct: number) => ((pct / 100) * W).toFixed(2)
  const usageTitle = escapeXml(`${usageText(view, lang)} — ${d.tooltipUsage}`)
  const timeTitle = escapeXml(`${timeText(view, now, timeZone, lang)} — ${d.tooltipTime}`)
  const markerX = Math.min(W - 1, Math.max(1, Number(x(elapsed)))).toFixed(2)
  const delta = deltaOf(view)
  const base = delta === undefined ? usage : Math.min(usage, elapsed)
  const deltaTitle =
    delta === undefined
      ? ''
      : escapeXml(delta.kind === 'over' ? d.tooltipOver(formatPercent(delta.size)) : d.tooltipUnder(formatPercent(delta.size)))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="25" viewBox="0 0 ${W} 10">`,
    '<style>',
    '.track{fill:#e3e3e0}.usage{fill:#2b74d9}.over{fill:#d64545}.under{fill:#2f9e55}.near{fill:#c77d12}.mark{stroke:#1f1e1d}',
    '@media (prefers-color-scheme: dark){.track{fill:#3a3a38}.usage{fill:#3b82f6}.over{fill:#ef5b5b}.under{fill:#4cc27a}.near{fill:#e6a028}.mark{stroke:#f5f4ef}}',
    '</style>',
    `<clipPath id="r"><rect x="0" y="2" width="${W}" height="6" rx="3"/></clipPath>`,
    `<g><title>${usageTitle}</title>`,
    `<rect class="track" x="0" y="2" width="${W}" height="6" rx="3"/>`,
    `<rect class="usage" x="0" y="2" width="${x(base)}" height="6" clip-path="url(#r)"/>`,
    '</g>',
    delta === undefined
      ? ''
      : `<g><title>${deltaTitle}</title><rect class="${deltaClass(view, delta)}" x="${x(base)}" y="2" width="${x(
          delta.size,
        )}" height="6" clip-path="url(#r)"/></g>`,
    hasTime
      ? `<g><title>${timeTitle}</title><line class="mark" x1="${markerX}" y1="0" x2="${markerX}" y2="10" stroke-width="2"/></g>`
      : '',
    '</svg>',
  ].join('')
}

/** Testo a destra del nome, come nel popup di Claude. */
export function resetText(view: WindowView, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const d = dict(lang)
  const t = view.time
  if (!t.ok) return d.resetNotReported
  if (t.isResetPassed) return d.alreadyReset
  if (view.kind === 'five_hour') return d.resetsIn(formatDuration(t.remainingMs, lang))

  return d.resetsAtWhen(formatResetTime(t.resetAt, now, timeZone, lang))
}

/** La riga sotto la barra: tempo trascorso e ritmo, o perché manca la stima. */
export function elapsedText(view: WindowView, now: number, timeZone?: string, lang: Lang = 'it'): string {
  const t = view.time
  if (!t.ok || t.isResetPassed) return timeText(view, now, timeZone, lang)

  return dict(lang).elapsed(formatPercent(t.elapsedPercent), t.isStartDerived)
}

/** Scarto minimo (punti percentuali) perché il tratto verde/rosso compaia. */
const DELTA_MIN = 0.5

export type Delta = { kind: 'over' | 'under'; size: number }

/**
 * Tratto colorato tra utilizzo reale e tempo trascorso: `over` (rosso) se si è
 * consumato più del tempo trascorso, `under` (verde) se meno.
 */
export function deltaOf(view: WindowView): Delta | undefined {
  if (!view.time.ok || view.time.isResetPassed) return undefined
  const usage = Math.min(100, Math.max(0, view.percentUsed))
  const diff = usage - view.time.elapsedPercent
  if (Math.abs(diff) < DELTA_MIN) return undefined

  return { kind: diff > 0 ? 'over' : 'under', size: Math.abs(diff) }
}

const WINDOW_KINDS = ['five_hour', 'seven_day'] as const

/**
 * "Questa sessione: 5 ore +6% · settimanale +1% (stima)": quanto sono saliti i
 * limiti durante i turni di questa sessione. undefined finché non c'è una lettura.
 */
export function sessionUseText(use: SessionUse | undefined, lang: Lang = 'it'): string | undefined {
  if (use === undefined) return undefined
  const d = dict(lang)
  const parts = WINDOW_KINDS.flatMap(kind => {
    const entry = use[kind]
    return entry === undefined ? [] : [`${d.sessionKind[kind]} +${formatPercent(roundUse(entry.used))}`]
  })

  return parts.length === 0 ? undefined : d.sessionUse(parts.join(' · '))
}

/** "Settimanale: Claude Code 38% · Chat 62%" (voci a 0% omesse). */
export function breakdownText(rows: readonly Breakdown[], lang: Lang = 'it'): string | undefined {
  const d = dict(lang)
  const parts = rows.filter(r => r.percent > 0).map(r => `${d.breakdownNames[r.key] ?? r.name} ${r.percent}%`)

  return parts.length === 0 ? undefined : d.breakdown(parts.join(' · '))
}

/** Nome mostrato per una riga del consumo per progetto. */
export function projectLabel(row: ProjectShare['rows'][number], lang: Lang = 'it'): string {
  if (row.isOthers) return dict(lang).projectsOthers
  return row.project.length > 32 ? `${row.project.slice(0, 31)}…` : row.project
}

/** Frase per il comando /usage-time; undefined senza dati. */
export function projectShareText(share: ProjectShare | null | undefined, lang: Lang = 'it'): string | undefined {
  if (share === null || share === undefined || share.rows.length === 0) return undefined

  return dict(lang).projectsLine(share.rows.map(r => `${projectLabel(r, lang)} ${r.percent}%`).join(' · '))
}

export type TextBars = {
  /** [utilizzo fino al ritmo, tratto rosso/verde, resto vuoto] */
  usage: [string, string, string]
  delta?: Delta['kind']
  time?: [string, string]
}

/** Barra a caratteri per il terminale: piena = reale, riga sotto = tempo. */
export function textBars(view: WindowView, cells: number): TextBars {
  const n = Math.max(10, Math.floor(cells))
  const cell = (pct: number) => Math.round((Math.min(100, Math.max(0, pct)) / 100) * n)
  const delta = deltaOf(view)
  const used = cell(view.percentUsed)
  const elapsed = view.time.ok && !view.time.isResetPassed ? cell(view.time.elapsedPercent) : undefined
  const time: TextBars['time'] = elapsed === undefined ? undefined : ['━'.repeat(elapsed), '┄'.repeat(n - elapsed)]
  if (delta === undefined || elapsed === undefined) {
    return { usage: ['█'.repeat(used), '', '░'.repeat(n - used)], time }
  }
  const lo = Math.min(used, elapsed)
  const hi = Math.max(used, elapsed)

  return {
    usage: ['█'.repeat(lo), (delta.kind === 'over' ? '█' : '▓').repeat(hi - lo), '░'.repeat(n - hi)],
    delta: delta.kind,
    time,
  }
}

type Table = Elements['desktop'] | Elements['terminal']

/** La finestra di contesto come il motore la misura. */
export type ContextInfo = { tokens?: number; window: number; percent?: number }

export type BandInput = {
  surface: string
  elements: Table
  lang: Lang
  views: readonly WindowView[]
  context?: ContextInfo
  /** Crediti a importo ("Crediti per sessioni cloud"), se il server li comunica. */
  credits?: readonly Credit[]
  now: number
  observedAt: number
  bodyColumns: number
  timeZone?: string
  /** Se presente, disegna una ✕ in alto a destra che chiude il riquadro. */
  onClose?: () => void
  /** true quando la scheda riempie un riquadro (pane): niente bordo proprio. */
  isPane?: boolean
  /** Consumo stimato di questa sessione. */
  sessionUse?: SessionUse
  /** Ripartizione del settimanale per prodotto (dal server). */
  breakdown?: readonly Breakdown[]
  /** Consumo per progetto nella finestra di 5 ore (tutte le sessioni). */
  projects?: ProjectShare | null
}

/** Larghezza massima della scheda, in colonne: quella del popup dei limiti. */
const CARD_COLUMNS = 58

/** "307.6k", "1M", "48.2k", "900". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '–'
  if (n >= 1e6) return `${trimZero((n / 1e6).toFixed(1))}M`
  if (n >= 1e3) return `${trimZero((n / 1e3).toFixed(1))}k`

  return String(Math.round(n))
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** La riga "Finestra di contesto · 307.6k / 1M (31%)". */
export function contextText(c: ContextInfo): string {
  const pct = c.percent ?? (c.tokens !== undefined && c.window > 0 ? Math.round((c.tokens / c.window) * 100) : undefined)
  const used = c.tokens === undefined ? '–' : formatTokens(c.tokens)

  return `${used} / ${formatTokens(c.window)}${pct === undefined ? '' : ` (${pct}%)`}`
}

/** Barra dei crediti usati, nello stile delle altre (vuota se nulla è usato). */
export function creditSvg(usedPercent: number): string {
  const W = 400
  const w = ((Math.min(100, Math.max(0, usedPercent)) / 100) * W).toFixed(2)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="25" viewBox="0 0 ${W} 10">`,
    '<style>.track{fill:#e3e3e0}.usage{fill:#2b74d9}',
    '@media (prefers-color-scheme: dark){.track{fill:#3a3a38}.usage{fill:#3b82f6}}</style>',
    `<clipPath id="r"><rect x="0" y="2" width="${W}" height="6" rx="3"/></clipPath>`,
    `<rect class="track" x="0" y="2" width="${W}" height="6" rx="3"/>`,
    `<rect class="usage" x="0" y="2" width="${w}" height="6" clip-path="url(#r)"/>`,
    '</svg>',
  ].join('')
}

/** Barra semplice della finestra di contesto, nello stile delle altre. */
export function contextSvg(c: ContextInfo, lang: Lang = 'it'): string {
  const W = 400
  const pct = c.percent ?? (c.tokens !== undefined && c.window > 0 ? (c.tokens / c.window) * 100 : 0)
  const w = ((Math.min(100, Math.max(0, pct)) / 100) * W).toFixed(2)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="25" viewBox="0 0 ${W} 10">`,
    '<style>.track{fill:#e3e3e0}.usage{fill:#2b74d9}',
    '@media (prefers-color-scheme: dark){.track{fill:#3a3a38}.usage{fill:#3b82f6}}</style>',
    `<clipPath id="r"><rect x="0" y="2" width="${W}" height="6" rx="3"/></clipPath>`,
    `<title>${escapeXml(dict(lang).contextTooltip(contextText(c)))}</title>`,
    `<rect class="track" x="0" y="2" width="${W}" height="6" rx="3"/>`,
    `<rect class="usage" x="0" y="2" width="${w}" height="6" clip-path="url(#r)"/>`,
    '</svg>',
  ].join('')
}

/** "37 pt sotto il ritmo" / "12 pt sopra il ritmo" / "in linea con il ritmo". */
export function paceShort(view: WindowView, lang: Lang = 'it'): { text: string; color?: PaceColor } | undefined {
  if (!view.time.ok || view.time.isResetPassed) return undefined
  const d = dict(lang)
  const delta = deltaOf(view)
  const color = paceColor(view)
  if (delta === undefined) return { text: d.paceEven, color }
  const pts = Math.round(delta.size)
  if (delta.kind === 'over') return { text: d.paceAhead(pts), color }

  return { text: d.paceBehind(pts), color }
}

/**
 * La scheda, costruita come il popup dei limiti di Claude: "Finestra di
 * contesto" in cima, poi "Limiti di utilizzo del piano" con nome a sinistra,
 * reset e percentuale a destra e barra sottile sotto. In più, sotto ogni barra,
 * una riga dim con il tempo trascorso e il ritmo. Allineata a destra.
 */
export function renderBand(input: BandInput): RenderElement {
  const { elements, views, context, now, timeZone, isPane, lang } = input
  const d = dict(lang)
  const { Box, Text, Button } = elements
  const isDesktop = input.surface === 'desktop' && 'Svg' in elements
  const Svg = isDesktop ? (elements as Elements['desktop']).Svg : undefined
  const width = Math.max(24, Math.min(CARD_COLUMNS, input.bodyColumns))
  const barCells = Math.max(10, width - 4)
  const contextCells = context === undefined ? 0 : Math.round((Math.min(100, context.percent ?? 0) / 100) * barCells)
  const sessionLine = sessionUseText(input.sessionUse, lang)
  const split = breakdownText(input.breakdown ?? [], lang)
  const projectRows = input.projects?.rows ?? []

  const card = (
    <Box
      key="usage-time-card"
      flexDirection="column"
      width={isPane ? undefined : width}
      borderStyle={isPane ? undefined : 'round'}
      borderColor={isPane ? undefined : 'subtle'}
      paddingX={isPane ? 0 : 1}
    >
      {context !== undefined && (
        <Box key="context" flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between">
            <Text dimColor>{d.contextTitle}</Text>
            <Text dimColor>{contextText(context)}</Text>
          </Box>
          {Svg !== undefined ? (
            <Svg source={contextSvg(context, lang)} alt={`${d.contextTitle}: ${contextText(context)}`} />
          ) : (
            <Text>
              <Text color="suggestion">{'█'.repeat(contextCells)}</Text>
              <Text dimColor>{'░'.repeat(barCells - contextCells)}</Text>
            </Text>
          )}
        </Box>
      )}
      <Box justifyContent="space-between">
        <Text dimColor>{d.cardTitle}</Text>
        {input.onClose !== undefined ? (
          <Button key="usage-time-close" role="dismiss" plain autoFocus onPress={input.onClose}>
            ✕
          </Button>
        ) : (
          <Text dimColor>⏱</Text>
        )}
      </Box>
      {views.map(view => {
          const pace = paceShort(view, lang)
          const bars = textBars(view, barCells)

          return (
            <Box key={windowKey(view)} flexDirection="column" marginTop={1}>
              <Box justifyContent="space-between">
                <Text bold>{windowName(view, lang)}</Text>
                <Text>
                  <Text dimColor>{resetText(view, now, timeZone, lang)}{'  '}</Text>
                  <Text>{formatPercent(view.percentUsed)}</Text>
                </Text>
              </Box>
              {Svg !== undefined ? (
                <Svg source={barSvg(view, now, timeZone, lang)} alt={accessibleSummary(view, now, timeZone, lang)} />
              ) : (
                <Text>
                  <Text color="suggestion">{bars.usage[0]}</Text>
                  {bars.delta !== undefined && (
                    <Text color={paceColor(view)}>{bars.usage[1]}</Text>
                  )}
                  <Text dimColor>{bars.usage[2]}</Text>
                </Text>
              )}
              <Box justifyContent="space-between">
                <Text dimColor>{elapsedText(view, now, timeZone, lang)}</Text>
                {pace !== undefined && <Text color={pace.color} dimColor={pace.color === undefined}>{pace.text}</Text>}
              </Box>
              {view.kind === 'seven_day' && view.name === undefined && split !== undefined && (
                <Text dimColor>{split}</Text>
              )}
            </Box>
          )
        })}
      {sessionLine !== undefined && (
        <Box key="session-use" marginTop={1}>
          <Text dimColor>{sessionLine}</Text>
        </Box>
      )}
      {projectRows.length > 0 && (
        <Box key="projects" flexDirection="column" marginTop={1}>
          <Text dimColor>{d.projectsTitle}</Text>
          {projectRows.map(row => {
            const cells = Math.max(1, Math.round((row.percent / 100) * Math.min(20, barCells)))
            return (
              <Box key={`project-${row.isOthers ? '*' : row.project}`} justifyContent="space-between">
                <Text>{projectLabel(row, lang)}</Text>
                <Text>
                  <Text color="suggestion">{'▮'.repeat(cells)}</Text>
                  <Text>{` ${row.percent}%`}</Text>
                </Text>
              </Box>
            )
          })}
        </Box>
      )}
      {(input.credits ?? []).map(credit => {
        const usedPct = credit.limit > 0 ? (credit.used / credit.limit) * 100 : 0
        const cells = Math.round((Math.min(100, Math.max(0, usedPct)) / 100) * barCells)
        const expiry = creditExpiryText(credit, now, timeZone, lang)

        return (
          <Box key={`credit-${credit.id}`} flexDirection="column" marginTop={1}>
            <Box justifyContent="space-between">
              <Text bold>{d.creditsTitle}</Text>
              <Text dimColor>{creditRemainingText(credit, lang)}</Text>
            </Box>
            {Svg !== undefined ? (
              <Svg source={creditSvg(usedPct)} alt={creditSummary(credit, now, timeZone, lang)} />
            ) : (
              <Text>
                <Text color="suggestion">{'█'.repeat(cells)}</Text>
                <Text dimColor>{'░'.repeat(barCells - cells)}</Text>
              </Text>
            )}
            {expiry !== undefined && <Text dimColor>{expiry}</Text>}
          </Box>
        )
      })}
    </Box>
  )

  if (isPane) return card

  return (
    <Box key="usage-time-bar" flexDirection="row" justifyContent="flex-end">
      {card}
    </Box>
  )
}

export type ModeButtonInput = {
  elements: Table
  lang: Lang
  /** Le etichette di modalità che il motore mostrerebbe in quel punto. */
  modes: readonly string[]
  views: readonly WindowView[]
  isOpen: boolean
  onPress: () => void
}

/**
 * Il pulsante accanto all'indicatore dei limiti: "⏱ 5h 42% · 7d 23%", ogni
 * finestra colorata come il ritmo (paceColor: rosso sopra, arancione fino a 5
 * punti sotto, verde oltre). Le etichette di
 * modalità del motore restano davanti, invariate.
 */
export function renderModeButton(input: ModeButtonInput): RenderElement {
  const { Box, Text, Button } = input.elements
  const parts = input.views.map((view, i) => {
    const color = paceColor(view)
    const short = shortName(view)

    return (
      <Text color={color}>
        {i > 0 ? ' · ' : ''}
        {short} {formatPercent(view.percentUsed)}
      </Text>
    )
  })

  return (
    <Box key="usage-time-mode" flexDirection="row" gap={1}>
      {input.modes.length > 0 && <Text dimColor>{input.modes.join(' & ')}</Text>}
      <Button key="usage-time-open" plain onPress={input.onPress}>
        {input.isOpen ? '▾ ' : '⏱ '}
        {parts.length > 0 ? parts : dict(input.lang).modeFallback}
      </Button>
    </Box>
  )
}

/** La scheda quando non c'è ancora nessun dato: un messaggio, nessun valore inventato. */
export function renderEmptyCard(
  elements: Table,
  lang: Lang,
  bodyColumns: number,
  onClose?: () => void,
  isPane?: boolean,
): RenderElement {
  const d = dict(lang)
  const { Box, Text, Button } = elements

  const card = (
    <Box
      key="usage-time-card"
      flexDirection="column"
      width={isPane ? undefined : Math.max(24, Math.min(CARD_COLUMNS, bodyColumns))}
      borderStyle={isPane ? undefined : 'round'}
      borderColor={isPane ? undefined : 'subtle'}
      paddingX={isPane ? 0 : 1}
    >
      <Box justifyContent="space-between">
        <Text dimColor>{d.cardTitle}</Text>
        {onClose !== undefined && (
          <Button key="usage-time-close" role="dismiss" plain autoFocus onPress={onClose}>
            ✕
          </Button>
        )}
      </Box>
      <Text dimColor>{d.emptyData}</Text>
    </Box>
  )

  if (isPane) return card

  return (
    <Box key="usage-time-bar" flexDirection="row" justifyContent="flex-end">
      {card}
    </Box>
  )
}

/** Testo compatto per la riga di stato: "5h 42% ⏱60% · 7d 18% ⏱35%". */
export function statusText(views: readonly WindowView[]): string {
  return views
    .map(view => {
      const short = shortName(view)
      const time = view.time.ok && !view.time.isResetPassed ? ` ⏱${Math.round(view.time.elapsedPercent)}%` : ' ⏱–'

      return `${short} ${formatPercent(view.percentUsed)}${time}`
    })
    .join(' · ')
}
