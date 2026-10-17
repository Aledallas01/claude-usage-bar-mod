import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface, SessionRateLimit } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'usage-time-bar'
const NOW = Date.parse('2026-10-10T17:30:00Z')
const BAND_ON = { options: { showBand: true } }
const TICK = 10_000

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-10T20:00:00Z' },
  { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-10-14T17:30:00Z' },
]

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

/**
 * Motore con uno store condiviso visibile al test: `shared` è il file che
 * anche le altre sessioni (e l'app tray) leggono e scrivono.
 */
function engineBeneath(on: On, own: { rateLimits: SessionRateLimit[]; costUsd?: number }, isSubscribed = false) {
  const shared: Record<string, unknown> = {}
  const clock = mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: shared[e.key] }))
  on('store.set', ($, e) => {
    shared[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete shared[e.key]

    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(shared) }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 1_000_000, tokens: 307_600, percent: 31 },
      rateLimits: own.rateLimits,
      ...(own.costUsd === undefined ? {} : { cost: { usd: own.costUsd } }),
    },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // Con abbonamento il motore dà un handle opaco per la richiesta al server.
  on('session.authorize', () => ({ value: isSubscribed ? { handle: 'h-1', kind: 'bearer' as const } : null }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'it', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text key="engine-own">fascia del motore</Text>
  })

  return { clock, shared }
}

/** Ciò che un'altra sessione scrive nello store quando riceve nuovi limiti. */
function otherSessionWrites(shared: Record<string, unknown>, observedAt: number, fivePercent: number) {
  shared.lastLimits = {
    observedAt,
    windows: [
      { kind: 'five_hour', label: 'Limite di 5 ore', percentUsed: fivePercent, resetsAt: '2026-10-10T20:00:00Z' },
      { kind: 'seven_day', label: 'Settimanale', percentUsed: 18.5, resetsAt: '2026-10-14T17:30:00Z' },
    ],
  }
}

async function start($: Engine, surface: RenderSurface = 'desktop') {
  await $.session.start({ cwd: '', surface, isInteractive: true })
}

describe('aggiornamento in tempo reale', () => {
  test('adotta entro un giro i limiti più recenti salvati da un\'altra sessione', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS })
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()

    // Un'altra scheda Code riceve una risposta: 5 h al 55%.
    otherSessionWrites(shared, NOW + 5_000, 55)
    await clock.advance(TICK)
    expect(await ui.find({ type: 'Text', text: /^55%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeUndefined()
    // Il contesto resta quello di questa sessione.
    expect(await ui.find({ type: 'Text', text: /307\.6k/ })).toBeDefined()
    await ui.unmount()
  })

  test('una lettura salvata più vecchia non sostituisce quella mostrata', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS })
    await start($)
    otherSessionWrites(shared, NOW - 60_000, 30)
    await clock.advance(TICK)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    await ui.unmount()
  })

  test('la lettura invariata di questa sessione non scavalca un dato più recente', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS })
    await start($)
    otherSessionWrites(shared, NOW + 5_000, 55)
    for (let i = 0; i < 3; i++) await clock.advance(TICK)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^55%$/ })).toBeDefined()
    expect((shared.lastLimits as { windows: { percentUsed: number }[] }).windows[0]?.percentUsed).toBe(55)
    await ui.unmount()
  })

  test('una nuova lettura di questa sessione viene salvata per le altre', BAND_ON, async ($, on) => {
    const own = { rateLimits: LIMITS }
    const { clock, shared } = engineBeneath(on, own)
    await start($)
    own.rateLimits = [{ ...LIMITS[0]!, percentUsed: 60 }, LIMITS[1]!]
    await clock.advance(TICK)
    const saved = shared.lastLimits as { observedAt: number; windows: { percentUsed: number }[] }
    expect(saved.windows[0]?.percentUsed).toBe(60)
    expect(saved.observedAt).toBe(NOW + TICK)
  })
})

describe('consumo di questa sessione', () => {
  test('conta solo gli aumenti visti durante i turni di questa sessione', BAND_ON, async ($, on) => {
    const own = { rateLimits: LIMITS }
    const { clock, shared } = engineBeneath(on, own)
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /Questa sessione: 5 ore \+0% · settimanale \+0%/ })).toBeDefined()

    // Un'altra sessione consuma mentre questa è ferma: non conta.
    otherSessionWrites(shared, NOW + 5_000, 50)
    await clock.advance(TICK)

    // Turno di questa sessione: il limite di 5 ore sale di 6 punti.
    await $.turn.start({ text: 'ciao', turnId: 't-1' })
    own.rateLimits = [{ ...LIMITS[0]!, percentUsed: 56 }, { ...LIMITS[1]!, percentUsed: 19.5 }]
    await clock.advance(TICK)
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't-1', reason: 'answer' })
    expect(await ui.find({ type: 'Text', text: /Questa sessione: 5 ore \+6% · settimanale \+1%/ })).toBeDefined()

    // Molto dopo la fine del turno, gli aumenti sono di altri.
    await clock.advance(5 * 60_000)
    otherSessionWrites(shared, NOW + 6 * 60_000, 70)
    await clock.advance(TICK)
    expect(await ui.find({ type: 'Text', text: /^70%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Questa sessione: 5 ore \+6%/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('lettura dal server (come il popup di Claude)', () => {
  const SERVER = {
    five_hour: { utilization: 21, resets_at: '2026-10-10T20:00:00.412+00:00' },
    seven_day: { utilization: 32, resets_at: '2026-10-14T17:30:00.412+00:00' },
    seven_day_opus: null,
  }

  function server(on: On, body: unknown = SERVER, status: number | (() => number) = 200, headers: Record<string, string> = {}) {
    const calls: { url: string; auth?: string; beta?: string }[] = []
    on('http.fetch', ($, e) => {
      calls.push({ url: e.url, auth: e.init?.auth, beta: e.init?.headers?.['anthropic-beta'] })
      const code = typeof status === 'function' ? status() : status

      return { value: { status: code, ok: code === 200, headers, text: JSON.stringify(body) } }
    })

    return calls
  }

  test('mostra subito i valori del server, più avanti di quelli della sessione', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: [{ ...LIMITS[0]!, percentUsed: 20 }, { ...LIMITS[1]!, percentUsed: 31 }] }, true)
    const calls = server(on)
    await start($)
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^21%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^32%$/ })).toBeDefined()
    expect(calls[0]).toEqual({ url: 'https://api.anthropic.com/api/oauth/usage', auth: 'h-1', beta: 'oauth-2025-04-20' })
    expect((shared.lastLimits as { windows: { percentUsed: number }[] }).windows.map(w => w.percentUsed)).toEqual([21, 32])
    await ui.unmount()
  })

  test('una risposta in ritardo della sessione non riporta indietro la percentuale', BAND_ON, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: [{ ...LIMITS[0]!, percentUsed: 20 }, LIMITS[1]!] }, true)
    server(on)
    await start($)
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ ...LIMITS[0]!, percentUsed: 20 }, LIMITS[1]!], changed: ['rateLimits'] })
    await clock.advance(TICK)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^21%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^20%$/ })).toBeUndefined()
    await ui.unmount()
  })

  test('interroga il server di nuovo dopo l\'intervallo', BAND_ON, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: LIMITS }, true)
    const calls = server(on)
    await start($)
    await clock.advance(1)
    expect(calls).toHaveLength(1)
    await clock.advance(60_000)
    expect(calls).toHaveLength(2)
  })

  test('dopo il reset vince la nuova finestra anche se più bassa', BAND_ON, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: LIMITS }, true)
    server(on, { five_hour: { utilization: 3, resets_at: '2026-10-11T01:00:00Z' } })
    await start($)
    await clock.advance(TICK)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^3%$/ })).toBeDefined()
    await ui.unmount()
  })

  test('errore del server: restano i valori della sessione', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS }, true)
    server(on, { error: 'x' }, 500)
    await start($)
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    expect((shared.serverStatus as { status: number }).status).toBe(500)
    await ui.unmount()
  })

  test('serverRefreshSeconds=0 non interroga mai il server', { options: { showBand: true, serverRefreshSeconds: 0 } }, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: LIMITS }, true)
    const calls = server(on)
    await start($)
    await clock.advance(120_000)
    expect(calls).toHaveLength(0)
  })

  test('429: rallenta (raddoppiando la pausa) e poi riprende', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS }, true)
    let code = 429
    const calls = server(on, SERVER, () => code)
    await start($)
    await clock.advance(1)
    expect(calls).toHaveLength(1)
    // Pausa di 2 minuti: al minuto non riprova.
    await clock.advance(60_000)
    expect(calls).toHaveLength(1)
    await clock.advance(60_000)
    expect(calls).toHaveLength(2)
    // Secondo rifiuto: la pausa diventa 4 minuti.
    await clock.advance(3 * 60_000)
    expect(calls).toHaveLength(2)
    code = 200
    await clock.advance(60_000)
    expect(calls).toHaveLength(3)
    expect(shared.serverBackoff).toBeUndefined()
    await clock.advance(60_000)
    expect(calls).toHaveLength(4)
  })

  test('429 con retry-after: aspetta quanto chiede il server', BAND_ON, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: LIMITS }, true)
    const calls = server(on, SERVER, 429, { 'retry-after': '600' })
    await start($)
    await clock.advance(1)
    await clock.advance(9 * 60_000)
    expect(calls).toHaveLength(1)
    await clock.advance(60_000)
    expect(calls).toHaveLength(2)
  })

  test('mostra Settimanale · Fable e i crediti cloud, anche nel pulsante', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS }, true)
    server(on, {
      ...SERVER,
      cloud_bucket: { utilization: 0, resets_at: '2026-11-05T07:59:00+00:00', limit_dollars: 250, used_dollars: 12.5, remaining_dollars: 237.5 },
      limits: [
        { kind: 'weekly_scoped', group: 'weekly', percent: 91, resets_at: '2026-10-14T17:30:00Z', scope: { model: { display_name: 'Fable' } } },
      ],
    })
    await start($)
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Settimanale · Fable' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^91%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Crediti per sessioni cloud' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '237,50 USD di 250 USD rimanenti' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Scade / })).toBeDefined()
    await ui.unmount()
    const button = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'SessionMode', props: { modes: [] } })
    expect(await button.find({ type: 'Text', text: /Fable 91%/ })).toBeDefined()
    await button.unmount()
    // Salvati per le altre sessioni e per l'app nella barra.
    const saved = shared.lastLimits as { scoped: { name: string }[]; credits: { remaining: number }[] }
    expect(saved.scoped[0]?.name).toBe('Fable')
    expect(saved.credits[0]?.remaining).toBe(237.5)
  })

  test('una sessione senza lettura dal server mostra Fable e crediti salvati da altre sessioni', BAND_ON, async ($, on) => {
    const { clock, shared } = engineBeneath(on, { rateLimits: LIMITS })
    await start($)
    shared.lastLimits = {
      observedAt: NOW + 1000,
      windows: [{ kind: 'five_hour', label: 'Limite di sessione', percentUsed: 42, resetsAt: '2026-10-10T20:00:00Z' }],
      scoped: [{ kind: 'seven_day', label: 'Fable', name: 'Fable', percentUsed: 91, resetsAt: '2026-10-14T17:30:00Z' }],
      credits: [{ id: 'x', limit: 250, used: 0, remaining: 250, currency: 'USD' }],
      extrasAt: NOW + 1000,
    }
    await clock.advance(TICK)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Settimanale · Fable' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '250 USD di 250 USD rimanenti' })).toBeDefined()
    await ui.unmount()
  })
})

describe('ripartizione del settimanale', () => {
  test('Settimanale: Claude Code 38% · Chat 62%, dal server', BAND_ON, async ($, on) => {
    const { clock } = engineBeneath(on, { rateLimits: LIMITS }, true)
    on('http.fetch', () => ({
      value: {
        status: 200,
        ok: true,
        headers: {},
        text: JSON.stringify({
          five_hour: { utilization: 42, resets_at: '2026-10-10T20:00:00Z' },
          seven_day: { utilization: 18.5, resets_at: '2026-10-14T17:30:00Z' },
          seven_day_breakdown: {
            rows: [
              { key: 'claude_code', display_name: 'Claude Code', percent: 38 },
              { key: 'chat', display_name: 'Chats', percent: 62 },
              { key: 'cowork', display_name: 'Cowork', percent: 0 },
            ],
          },
        }),
      },
    }))
    await start($)
    await clock.advance(1)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Settimanale: Claude Code 38% · Chat 62%' })).toBeDefined()
    await ui.unmount()
  })

  test('alla partenza toglie le voci del consumo per progetto lasciate dalla 0.10.0 locale', BAND_ON, async ($, on) => {
    const { shared } = engineBeneath(on, { rateLimits: LIMITS })
    shared['proj:abc'] = { project: 'x', events: [[NOW, 1]] }
    shared.projectShare = { from: NOW, rows: [{ project: 'x', percent: 100 }] }
    await start($)
    expect(shared['proj:abc']).toBeUndefined()
    expect(shared.projectShare).toBeUndefined()
  })


})
