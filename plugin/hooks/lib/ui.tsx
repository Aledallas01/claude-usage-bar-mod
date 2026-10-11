// Modulo di integrazione con la UI: disegna le due barre (utilizzo reale +
// progressione temporale teorica) con gli elementi della superficie.

import type { Elements, RenderElement } from 'claude-code'

import { dict } from './i18n'
import type { Lang } from './i18n'
import { formatDuration, formatPercent, formatResetTime } from './timeWindow'
import type { WindowView } from './windows'

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
  const label = d.windowLabel[view.kind]

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
    '.track{fill:#e3e3e0}.usage{fill:#2b74d9}.over{fill:#d64545}.under{fill:#2f9e55}.mark{stroke:#1f1e1d}',
    '@media (prefers-color-scheme: dark){.track{fill:#3a3a38}.usage{fill:#3b82f6}.over{fill:#ef5b5b}.under{fill:#4cc27a}.mark{stroke:#f5f4ef}}',
    '</style>',
    `<clipPath id="r"><rect x="0" y="2" width="${W}" height="6" rx="3"/></clipPath>`,
    `<g><title>${usageTitle}</title>`,
    `<rect class="track" x="0" y="2" width="${W}" height="6" rx="3"/>`,
    `<rect class="usage" x="0" y="2" width="${x(base)}" height="6" clip-path="url(#r)"/>`,
    '</g>',
    delta === undefined
      ? ''
      : `<g><title>${deltaTitle}</title><rect class="${delta.kind}" x="${x(base)}" y="2" width="${x(
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
  now: number
  observedAt: number
  bodyColumns: number
  timeZone?: string
  /** Se presente, disegna una ✕ in alto a destra che chiude il riquadro. */
  onClose?: () => void
  /** true quando la scheda riempie un riquadro (pane): niente bordo proprio. */
  isPane?: boolean
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
export function paceShort(view: WindowView, lang: Lang = 'it'): { text: string; color?: 'error' | 'success' } | undefined {
  if (!view.time.ok || view.time.isResetPassed) return undefined
  const d = dict(lang)
  const delta = deltaOf(view)
  if (delta === undefined) return { text: d.paceEven }
  const pts = Math.round(delta.size)
  if (delta.kind === 'over') return { text: d.paceAhead(pts), color: 'error' }

  return { text: d.paceBehind(pts), color: 'success' }
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
            <Box key={`win-${view.kind}`} flexDirection="column" marginTop={1}>
              <Box justifyContent="space-between">
                <Text bold>{d.windowLabel[view.kind]}</Text>
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
                    <Text color={bars.delta === 'over' ? 'error' : 'success'}>{bars.usage[1]}</Text>
                  )}
                  <Text dimColor>{bars.usage[2]}</Text>
                </Text>
              )}
              <Box justifyContent="space-between">
                <Text dimColor>{elapsedText(view, now, timeZone, lang)}</Text>
                {pace !== undefined && <Text color={pace.color} dimColor={pace.color === undefined}>{pace.text}</Text>}
              </Box>
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
 * finestra colorata in rosso (sopra il ritmo) o verde (sotto). Le etichette di
 * modalità del motore restano davanti, invariate.
 */
export function renderModeButton(input: ModeButtonInput): RenderElement {
  const { Box, Text, Button } = input.elements
  const parts = input.views.map((view, i) => {
    const delta = deltaOf(view)
    const color = delta === undefined ? undefined : delta.kind === 'over' ? 'error' : 'success'
    const short = view.kind === 'five_hour' ? '5h' : '7d'

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
      const short = view.kind === 'five_hour' ? '5h' : '7d'
      const time = view.time.ok && !view.time.isResetPassed ? ` ⏱${Math.round(view.time.elapsedPercent)}%` : ' ⏱–'

      return `${short} ${formatPercent(view.percentUsed)}${time}`
    })
    .join(' · ')
}
