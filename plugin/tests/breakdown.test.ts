import { describe, expect, test } from 'claude-code/testing'

import { parseServerExtras } from '../hooks/lib/serverUsage'
import { breakdownText } from '../hooks/lib/ui'

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
