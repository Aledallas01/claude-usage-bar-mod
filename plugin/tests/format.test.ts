import { describe, expect, test } from 'claude-code/testing'

import { contextText, formatTokens } from '../hooks/lib/ui'

describe('formato dei token come nel popup di Claude', () => {
  test('migliaia e milioni', () => {
    expect(formatTokens(307_600)).toBe('307.6k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(48_200)).toBe('48.2k')
    expect(formatTokens(900)).toBe('900')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_500_000)).toBe('1.5M')
  })
  test('riga del contesto', () => {
    expect(contextText({ window: 1_000_000, tokens: 307_600, percent: 31 })).toBe('307.6k / 1M (31%)')
    expect(contextText({ window: 200_000, tokens: 50_000 })).toBe('50k / 200k (25%)')
    expect(contextText({ window: 200_000 })).toBe('– / 200k')
  })
})
