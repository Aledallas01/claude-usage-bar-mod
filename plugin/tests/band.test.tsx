import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface, SessionMeasureInput, SessionRateLimit } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'usage-time-bar'
const NOW = Date.parse('2026-10-10T17:30:00Z')
const SURFACES = ['desktop', 'terminal'] as const
/** La fascia sopra il prompt è spenta di default: questi test la accendono. */
const BAND_ON = { options: { showBand: true } }

// five_hour: metà finestra trascorsa (reset alle 20:00Z, inizio stimato 15:00Z).
// seven_day: 3 giorni su 7 trascorsi.
const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-10T20:00:00Z' },
  { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-10-14T17:30:00Z' },
]

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

/** I riquadri aperti e chiusi dalla mod, per id. */
const panes = { opened: [] as string[], closed: [] as string[] }

/** Il "motore" sotto la mod: risponde alle chiamate che la mod fa su `$`. */
function engineBeneath(on: On, rateLimits: SessionRateLimit[] = LIMITS) {
  panes.opened = []
  panes.closed = []
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 1_000_000, tokens: 307_600, percent: 31 }, rateLimits },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'it', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.open', ($, e) => {
    panes.opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    panes.closed.push(e.id)

    return { value: undefined }
  })
  on('ui.focus', () => ({}))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>modi del motore</Text>
  })
  // Ciò che il motore disegnerebbe da solo nella fascia (nulla di nostro).
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text key="engine-own">fascia del motore</Text>
  })

  return clock
}

/** Le barre delle finestre, senza quella del contesto, nell'ordine dell'app. */
async function windowSvgs(ui: { findAll: (q: { type?: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Svg' })).filter(svg => !String(svg.props.alt).startsWith('Finestra di contesto'))
}

async function start($: Engine, surface: RenderSurface = 'desktop') {
  await $.session.start({ cwd: '', surface, isInteractive: true })
}

function measure(rateLimits: SessionRateLimit[]): SessionMeasureInput {
  return { context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] }
}

function command($: Engine, args: string) {
  return $.command.run({
    command: 'usage-time',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

describe('fascia sopra il prompt', () => {
  test('mostra utilizzo reale invariato e tempo trascorso, su desktop e terminale', BAND_ON, async ($, on) => {
    engineBeneath(on)
    await start($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await ui.find({ type: 'Text', text: 'fascia del motore' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^18\.5%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Tempo trascorso 50% \(stimato\)/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Tempo trascorso 42\.9%/ })).toBeDefined()
      // Il tooltip (alt dell'SVG) distingue dato ufficiale e stima della mod.
      if (surface === 'desktop') {
        const alt = String((await windowSvgs(ui))[1]?.props.alt)
        expect(alt).toMatch(/dato ufficiale di Claude/)
        expect(alt).toMatch(/progressione temporale teorica, calcolata dalla mod/)
      }
      await ui.unmount()
    }
  })

  test('su desktop la barra SVG riproduce esattamente la percentuale reale', BAND_ON, async ($, on) => {
    engineBeneath(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    const svgs = await windowSvgs(ui)
    expect(svgs).toHaveLength(2)
    const five = String(svgs[0]?.props.source)
    // 42% di 400 = 168.00; tacca del tempo al 50% = 200.00.
    expect(five.includes('class="usage" x="0" y="2" width="168.00"')).toBe(true)
    expect(five.includes('class="mark" x1="200.00"')).toBe(true)
    expect(String(svgs[0]?.props.alt)).toMatch(/Utilizzo reale 42% \(dato ufficiale di Claude\)/)
    expect(String(svgs[0]?.props.alt)).toMatch(/progressione temporale teorica/)
    await ui.unmount()
  })

  test('senza dati la mod non disegna nulla e lascia la fascia al motore', BAND_ON, async ($, on) => {
    engineBeneath(on, [])
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'fascia del motore' })).toBeDefined()
    expect(await ui.find({ key: 'usage-time-bar' })).toBeUndefined()
    await ui.unmount()
  })

  test('si aggiorna quando arrivano nuovi limiti (session.measure) e con il passare del tempo', BAND_ON, async ($, on) => {
    const clock = engineBeneath(on, [])
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ key: 'usage-time-bar' })).toBeUndefined()

    const echoed = await $.session.measure(measure(LIMITS))
    expect(echoed).toEqual({ changed: ['rateLimits'] })
    expect(await ui.find({ type: 'Text', text: /Tempo trascorso 50%/ })).toBeDefined()

    await clock.advance(30 * 60_000)
    expect(await ui.find({ type: 'Text', text: /Tempo trascorso 60%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()

    await $.session.measure(measure([{ ...LIMITS[0]!, percentUsed: 47 }, LIMITS[1]!]))
    expect(await ui.find({ type: 'Text', text: /^47%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('reset già avvenuto: nessuna progressione inventata', BAND_ON, async ($, on) => {
    const clock = engineBeneath(on)
    await start($)
    await clock.advance(3 * 3_600_000) // oltre le 20:00Z del reset di 5 ore
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Reset già avvenuto/ })).toBeDefined()
    const svgs = await windowSvgs(ui)
    expect(String(svgs[0]?.props.source).includes('class="mark"')).toBe(false)
    await ui.unmount()
  })

  test('reset mancante: "Stima non disponibile"', BAND_ON, async ($, on) => {
    engineBeneath(on, [{ kind: 'five_hour', percentUsed: 10 }])
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Stima non disponibile/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^10%$/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('idempotenza e ricaricamento', () => {
  test('una sola sezione per finestra anche dopo molti aggiornamenti e ridisegni', BAND_ON, async ($, on) => {
    const clock = engineBeneath(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    for (let i = 0; i < 5; i++) {
      await $.session.measure(measure(LIMITS))
      await clock.advance(60_000)
    }
    expect(await ui.findAll({ key: 'win-five_hour' })).toHaveLength(1)
    expect(await ui.findAll({ key: 'win-seven_day' })).toHaveLength(1)
    expect(await ui.findAll({ key: 'usage-time-bar' })).toHaveLength(1)
    expect(await windowSvgs(ui)).toHaveLength(2)
    await ui.unmount()
  })

  test('un secondo session.start (ricaricamento) non duplica nulla e conserva i dati', BAND_ON, async ($, on) => {
    engineBeneath(on)
    await start($)
    await start($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await ui.findAll({ key: 'usage-time-bar' })).toHaveLength(1)
      expect(await ui.findAll({ key: 'win-five_hour' })).toHaveLength(1)
      await ui.unmount()
      const again = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
      expect(await again.findAll({ key: 'win-five_hour' })).toHaveLength(1)
      await again.unmount()
    }
  })

  test('i dati salvati sopravvivono a una nuova sessione', BAND_ON, async ($, on) => {
    // Prima sessione: riceve i limiti e li salva. Seconda: session.usage è vuoto.
    let rateLimits = LIMITS
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits } }))
    on('ui.status', () => ({ value: undefined }))
    await start($)
    rateLimits = []
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('comando /usage-time', () => {
  test('riepilogo, nascondi e mostra', BAND_ON, async ($, on) => {
    engineBeneath(on)
    await start($)
    const summary = await command($, '')
    expect(summary.text).toMatch(/Limite di sessione: Utilizzo reale 42%/)
    expect(summary.text).toMatch(/Settimanale · tutti i modelli: Utilizzo reale 18.5%/)

    await command($, 'nascondi')
    const hidden = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await hidden.find({ key: 'usage-time-bar' })).toBeUndefined()
    expect(await hidden.find({ type: 'Text', text: 'fascia del motore' })).toBeDefined()
    await hidden.unmount()

    await command($, 'mostra')
    const shown = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await shown.find({ key: 'usage-time-bar' })).toBeDefined()
    await shown.unmount()
  })
})

describe('configurazione', () => {
  test('showBand=false lascia la fascia al motore', { options: { showBand: false } }, async ($, on) => {
    engineBeneath(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'fascia del motore' })).toBeDefined()
    await ui.unmount()
  })

  test('showStatus=true scrive il riepilogo nella riga di stato', { options: { showStatus: true } }, async ($, on) => {
    const lines: (string | undefined)[] = []
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: LIMITS } }))
    on('ui.status', ($, e) => {
      lines.push(e.text)

      return { value: undefined }
    })
    await start($)
    expect(lines.at(-1)).toBe('5h 42% ⏱50% · 7d 18.5% ⏱43%')
  })
})

describe('tratto verde / rosso rispetto al ritmo', () => {
  async function firstSvg($: Engine) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    const svg = String((await windowSvgs(ui))[0]?.props.source)

    return { ui, svg }
  }

  test('sotto il ritmo: arancione fino al reale, verde fino al tempo trascorso', BAND_ON, async ($, on) => {
    engineBeneath(on) // 42% usato, 50% di tempo trascorso
    await start($)
    const { ui, svg } = await firstSvg($)
    expect(svg.includes('class="usage" x="0" y="2" width="168.00"')).toBe(true)
    expect(svg.includes('class="under" x="168.00" y="2" width="32.00"')).toBe(true)
    expect(svg.includes('class="over"')).toBe(false)
    const pace = await ui.find({ type: 'Text', text: '8 pt sotto il ritmo' })
    expect(pace?.props.color).toBe('success')
    await ui.unmount()
  })

  test('sopra il ritmo: arancione fino al tempo trascorso, rosso fino al reale', BAND_ON, async ($, on) => {
    engineBeneath(on, [{ ...LIMITS[0]!, percentUsed: 70 }, LIMITS[1]!])
    await start($)
    const { ui, svg } = await firstSvg($)
    expect(svg.includes('class="usage" x="0" y="2" width="200.00"')).toBe(true)
    expect(svg.includes('class="over" x="200.00" y="2" width="80.00"')).toBe(true)
    expect(svg.includes('class="under"')).toBe(false)
    await ui.unmount()
  })

  test('in pari: nessun tratto colorato', BAND_ON, async ($, on) => {
    engineBeneath(on, [{ ...LIMITS[0]!, percentUsed: 50 }])
    await start($)
    const { ui, svg } = await firstSvg($)
    expect(svg.includes('class="over"') || svg.includes('class="under"')).toBe(false)
    await ui.unmount()
  })

  test('terminale: il tratto oltre il ritmo è rosso', BAND_ON, async ($, on) => {
    engineBeneath(on, [{ ...LIMITS[0]!, percentUsed: 70 }])
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    const texts = await ui.findAll({ type: 'Text', text: /^█+$/ })
    expect(texts.some(el => el.props.color === 'error')).toBe(true)
    await ui.unmount()
  })
})

const MODE = { component: 'SessionMode' as const, props: { modes: ['focus'] } }
const PANE = {
  component: 'Pane' as const,
  requestId: 'usage-time',
  props: {
    title: 'Limiti di utilizzo · ritmo',
    isFocused: true,
    bodyColumns: 56,
    placement: 'inline' as const,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}

function focus($: Engine, element?: string) {
  return $.ui.focus({ component: 'Pane', requestId: 'usage-time', origin: { kind: 'person' }, ...(element ? { element } : {}) })
}

describe('pulsante accanto ai limiti e popup', () => {
  test('il pulsante mostra le finestre colorate e conserva le modalità del motore', async ($, on) => {
    engineBeneath(on, [LIMITS[0]!, { ...LIMITS[1]!, percentUsed: 60 }])
    await start($)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...MODE })
      expect(await ui.find({ type: 'Text', text: 'focus' })).toBeDefined()
      const button = await ui.find({ key: 'usage-time-open' })
      expect(button?.text).toMatch(/5h 42% · 7d 60%/)
      const five = await ui.find({ type: 'Text', text: '5h 42%' })
      const seven = await ui.find({ type: 'Text', text: /7d 60%/ })
      expect(five?.props.color).toBe('success') // 42% usato, 50% di tempo: sotto il ritmo
      expect(seven?.props.color).toBe('error') // 60% usato, 42.9% di tempo: sopra il ritmo
      await ui.unmount()
    }
  })

  test('premere il pulsante apre il riquadro, premerlo di nuovo lo chiude', async ($, on) => {
    engineBeneath(on)
    await start($)
    const button = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...MODE })

    await button.press({ key: 'usage-time-open' })
    expect(panes.opened).toEqual(['usage-time'])
    expect((await button.find({ key: 'usage-time-open' }))?.text).toMatch(/^▾/)

    await button.press({ key: 'usage-time-open' })
    expect(panes.closed).toEqual(['usage-time'])
    expect((await button.find({ key: 'usage-time-open' }))?.text).toMatch(/^⏱/)
    await button.unmount()
  })

  test('il riquadro mostra la stessa scheda del popup di Claude', async ($, on) => {
    engineBeneath(on)
    await start($)
    const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    expect(await pane.find({ type: 'Text', text: 'Finestra di contesto' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '307.6k / 1M (31%)' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Limite di sessione' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Settimanale · tutti i modelli' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Si ripristina tra 2 h 30 min/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^18\.5%$/ })).toBeDefined()
    expect(await windowSvgs(pane)).toHaveLength(2)
    // La ✕ in alto a destra prende il focus all'apertura (clic-fuori funziona).
    const close = await pane.find({ key: 'usage-time-close' })
    expect(close?.props.autoFocus).toBe(true)

    // Un nuovo contesto misurato aggiorna la riga; i limiti restano.
    await $.session.measure({
      context: { window: 1_000_000, tokens: 412_000, percent: 41 },
      rateLimits: LIMITS,
      changed: ['context'],
    })
    expect(await pane.find({ type: 'Text', text: '412k / 1M (41%)' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    await pane.unmount()
  })

  test('con sistema in inglese i testi del riquadro sono tradotti', async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('session.usage', () => ({
      value: { startedAt: NOW, context: { window: 1_000_000, tokens: 307_600, percent: 31 }, rateLimits: LIMITS },
    }))
    on('ui.status', () => ({ value: undefined }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: 'en-US', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })) // lingua di sistema inglese
    await start($)
    const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    expect(await pane.find({ type: 'Text', text: 'Context window' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Plan usage limits · pace' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Session limit' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: 'Weekly · all models' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Resets in 2h 30m/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '8 pts behind pace' })).toBeDefined()
    // niente parole italiane
    expect(await pane.find({ type: 'Text', text: 'Limite di sessione' })).toBeUndefined()
    await pane.unmount()
  })

  test('clic fuori dal riquadro (il focus lo lascia) lo chiude', async ($, on) => {
    engineBeneath(on)
    await start($)
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    await focus($) // il focus esce dal riquadro: nessun elemento
    expect(panes.closed).toEqual(['usage-time'])
  })

  test('un clic dentro il riquadro non lo chiude', async ($, on) => {
    engineBeneath(on)
    await start($)
    await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    await focus($, 'usage-time-close') // il focus resta su un elemento della scheda
    expect(panes.closed).toEqual([])
  })

  test('la ✕ chiude il riquadro', async ($, on) => {
    engineBeneath(on)
    await start($)
    const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    await pane.press({ key: 'usage-time-close' })
    expect(panes.closed).toEqual(['usage-time'])
    await pane.unmount()
  })

  test('chiudere il riquadro rimette il pulsante in stato chiuso', async ($, on) => {
    engineBeneath(on)
    await start($)
    const button = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...MODE })
    await button.press({ key: 'usage-time-open' })
    expect((await button.find({ key: 'usage-time-open' }))?.text).toMatch(/^▾/)
    // Chiusura (✕/Esc/clic fuori → closePane → ui.close): lo stato si allinea.
    const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    await pane.press({ key: 'usage-time-close' })
    expect((await button.find({ key: 'usage-time-open' }))?.text).toMatch(/^⏱/)
    await pane.unmount()
    await button.unmount()
  })

  test('riquadro senza dati: messaggio invece di valori inventati, con la ✕', async ($, on) => {
    engineBeneath(on, [])
    await start($)
    const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...PANE })
    expect(await pane.find({ type: 'Text', text: /Nessun dato sui limiti/ })).toBeDefined()
    expect(await pane.find({ key: 'usage-time-close' })).toBeDefined()
    await pane.unmount()
  })

  test('/usage-time apre il riquadro', async ($, on) => {
    engineBeneath(on)
    await start($)
    await command($, '')
    expect(panes.opened).toEqual(['usage-time'])
  })

  test('la fascia sopra il prompt è spenta di default', async ($, on) => {
    engineBeneath(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'fascia del motore' })).toBeDefined()
    await ui.unmount()
  })

  test('showButton=false lascia il piede del prompt al motore', { options: { showButton: false } }, async ($, on) => {
    engineBeneath(on)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...MODE })
    expect(await ui.find({ type: 'Text', text: 'modi del motore' })).toBeDefined()
    expect(await ui.find({ key: 'usage-time-open' })).toBeUndefined()
    await ui.unmount()
  })
})
