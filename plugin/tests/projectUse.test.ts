import { describe, expect, test } from 'claude-code/testing'

import { aggregateProjects, appendCost, lastActivity, parseProjectLog, PROJECT_KEEP_MS, projectName } from '../hooks/lib/projectUse'
import { parseServerExtras } from '../hooks/lib/serverUsage'
import { breakdownText } from '../hooks/lib/ui'

const NOW = Date.parse('2026-10-17T12:00:00Z')

describe('consumo per progetto', () => {
  test('nome del progetto dalla cartella (Windows e Unix)', () => {
    expect(projectName('C:\\Users\\me\\Desktop\\ClaudeUsageBarMod')).toBe('ClaudeUsageBarMod')
    expect(projectName('/home/me/app/')).toBe('app')
    expect(projectName('')).toBe('?')
  })

  test('spese ravvicinate si uniscono, quelle vecchie si tolgono', () => {
    let log = { project: 'a', events: [[NOW - PROJECT_KEEP_MS - 1, 9]] as [number, number][] }
    log = appendCost(log, NOW, 1)
    log = appendCost(log, NOW + 30_000, 0.5)
    log = appendCost(log, NOW + 120_000, 2)
    expect(log.events).toEqual([
      [NOW, 1.5],
      [NOW + 120_000, 2],
    ])
    expect(lastActivity(log)).toBe(NOW + 120_000)
  })

  test('quote che sommano 100, i primi 4 per nome e il resto in "altri"', () => {
    const logs = ['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => ({ project: p, events: [[NOW, 6 - i]] as [number, number][] }))
    const share = aggregateProjects(logs, NOW - 1)
    expect(share.rows.map(r => r.project || '*')).toEqual(['a', 'b', 'c', 'd', '*'])
    expect(share.rows.reduce((s, r) => s + r.percent, 0)).toBe(100)
    expect(share.rows[4]?.isOthers).toBe(true)
  })

  test('due sessioni dello stesso progetto si sommano', () => {
    const share = aggregateProjects(
      [
        { project: 'x', events: [[NOW, 1]] },
        { project: 'x', events: [[NOW, 1]] },
        { project: 'y', events: [[NOW, 2]] },
      ],
      NOW - 1,
    )
    expect(share.rows).toEqual([
      { project: 'x', percent: 50 },
      { project: 'y', percent: 50 },
    ])
  })

  test('nessuna spesa nella finestra: nessuna riga', () => {
    expect(aggregateProjects([{ project: 'x', events: [[NOW - 10, 1]] }], NOW).rows).toEqual([])
  })

  test('registri non validi vengono ignorati o ripuliti', () => {
    expect(parseProjectLog(null)).toBeUndefined()
    expect(parseProjectLog({ project: 3, events: [] })).toBeUndefined()
    expect(parseProjectLog({ project: 'x', events: [[NOW, 1], ['a', 2], [NOW, -1], [NOW]] })).toEqual({ project: 'x', events: [[NOW, 1]] })
  })
})

describe('ripartizione del settimanale', () => {
  test('dal campo seven_day_breakdown del server', () => {
    const text = JSON.stringify({
      seven_day_breakdown: {
        rows: [
          { key: 'claude_code', display_name: 'Claude Code', percent: 38 },
          { key: 'chat', display_name: 'Chats', percent: 62 },
          { key: 'other', display_name: 'Other', percent: 0 },
        ],
      },
    })
    const rows = parseServerExtras(text).breakdown
    expect(rows).toEqual([
      { key: 'claude_code', name: 'Claude Code', percent: 38 },
      { key: 'chat', name: 'Chats', percent: 62 },
      { key: 'other', name: 'Other', percent: 0 },
    ])
    expect(breakdownText(rows, 'it')).toBe('Settimanale: Claude Code 38% · Chat 62%')
    expect(breakdownText(rows, 'en')).toBe('Weekly: Claude Code 38% · Chat 62%')
  })

  test('chiave sconosciuta: usa il nome del server; senza dati nessuna riga', () => {
    expect(breakdownText([{ key: 'new_thing', name: 'New thing', percent: 10 }], 'it')).toBe('Settimanale: New thing 10%')
    expect(breakdownText([], 'it')).toBeUndefined()
    expect(parseServerExtras('{}').breakdown).toEqual([])
  })
})
