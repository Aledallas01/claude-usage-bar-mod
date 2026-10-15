import { describe, expect, test } from 'claude-code/testing'

import { accrue, isSessionActive, roundUse, SESSION_GRACE_MS } from '../hooks/lib/sessionUse'
import { sessionUseText } from '../hooks/lib/ui'

const R5 = '2026-10-10T20:00:00Z'
const R7 = '2026-10-14T17:30:00Z'
const five = (percentUsed: number, resetsAt = R5) => ({ kind: 'five_hour', percentUsed, resetsAt })
const seven = (percentUsed: number, resetsAt = R7) => ({ kind: 'seven_day', percentUsed, resetsAt })

describe('consumo della sessione', () => {
  test('la prima lettura è il punto di partenza, non consumo', () => {
    const use = accrue({}, [five(40), seven(20)], true)
    expect(use.five_hour?.used).toBe(0)
    expect(use.seven_day?.used).toBe(0)
    expect(use.five_hour?.last).toBe(40)
  })

  test('conta gli aumenti solo mentre la sessione lavora', () => {
    let use = accrue({}, [five(40), seven(20)], false)
    use = accrue(use, [five(46), seven(21)], true)
    use = accrue(use, [five(50), seven(22)], false)
    use = accrue(use, [five(52), seven(22.5)], true)
    expect(use.five_hour?.used).toBe(8)
    expect(use.seven_day?.used).toBe(1.5)
  })

  test('un orario di reset arrotondato è la stessa finestra', () => {
    let use = accrue({}, [five(40)], true)
    use = accrue(use, [five(43, '2026-10-10T19:59:59.700Z')], true)
    expect(use.five_hour?.used).toBe(3)
  })

  test('dopo il reset riparte dalla nuova finestra', () => {
    let use = accrue({}, [five(80)], true)
    use = accrue(use, [five(90)], true)
    use = accrue(use, [five(4, '2026-10-11T01:00:00Z')], true)
    expect(use.five_hour?.used).toBe(4)
    expect(use.five_hour?.resetsAt).toBe('2026-10-11T01:00:00Z')
    use = accrue(use, [five(2, '2026-10-11T06:00:00Z')], false)
    expect(use.five_hour?.used).toBe(0)
  })

  test('ignora i limiti di un singolo modello e le altre finestre', () => {
    const use = accrue({}, [{ kind: 'seven_day', percentUsed: 9, resetsAt: R7, name: 'Fable' }, { kind: 'spend_limit', percentUsed: 3 }], true)
    expect(use).toEqual({})
  })

  test('attiva durante un turno e per un breve margine dopo', () => {
    expect(isSessionActive(1, 0, 1_000)).toBe(true)
    expect(isSessionActive(0, 0, 1_000)).toBe(false)
    expect(isSessionActive(0, 1_000, 1_000 + SESSION_GRACE_MS)).toBe(true)
    expect(isSessionActive(0, 1_000, 1_001 + SESSION_GRACE_MS)).toBe(false)
  })

  test('arrotonda senza -0', () => {
    expect(roundUse(5.96)).toBe(6)
    expect(roundUse(-0.01)).toBe(0)
  })

  test('testo della scheda', () => {
    expect(sessionUseText(undefined)).toBeUndefined()
    expect(sessionUseText({})).toBeUndefined()
    const use = { five_hour: { resetsAt: R5, last: 46, used: 6 }, seven_day: { resetsAt: R7, last: 21, used: 1.25 } }
    expect(sessionUseText(use, 'it')).toBe('Questa sessione: 5 ore +6% · settimanale +1.3% (stima)')
    expect(sessionUseText(use, 'en')).toBe('This session: 5-hour +6% · weekly +1.3% (estimate)')
  })
})
