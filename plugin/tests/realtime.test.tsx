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
function engineBeneath(on: On, own: { rateLimits: SessionRateLimit[] }) {
  const shared: Record<string, unknown> = {}
  const clock = mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: shared[e.key] }))
  on('store.set', ($, e) => {
    shared[e.key] = e.value

    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 1_000_000, tokens: 307_600, percent: 31 }, rateLimits: own.rateLimits },
  }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
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
