import { describe, expect, it } from 'vitest'
import { LEGEND_KEY, readLegendHidden, writeLegendHidden } from './legendPref'

const mem = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('legend preference', () => {
  it('is null until chosen, then round-trips', () => {
    const s = mem()
    expect(readLegendHidden(s)).toBeNull()
    writeLegendHidden(s, true)
    expect(s.getItem(LEGEND_KEY)).toBe('1')
    expect(readLegendHidden(s)).toBe(true)
    writeLegendHidden(s, false)
    expect(readLegendHidden(s)).toBe(false)
  })
  it('survives blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readLegendHidden(blocked)).toBeNull()
    expect(() => writeLegendHidden(blocked, true)).not.toThrow()
    expect(readLegendHidden(null)).toBeNull()
  })
})
