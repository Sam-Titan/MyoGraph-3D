import { describe, expect, it } from 'vitest'
import { INTRO_KEY, readIntroCollapsed, writeIntroCollapsed } from './introPref'

const mem = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('intro preference', () => {
  it('is null until chosen, then round-trips', () => {
    const s = mem()
    expect(readIntroCollapsed(s)).toBeNull()
    writeIntroCollapsed(s, true)
    expect(s.getItem(INTRO_KEY)).toBe('1')
    expect(readIntroCollapsed(s)).toBe(true)
    writeIntroCollapsed(s, false)
    expect(readIntroCollapsed(s)).toBe(false)
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
    expect(readIntroCollapsed(blocked)).toBeNull()
    expect(() => writeIntroCollapsed(blocked, true)).not.toThrow()
    expect(readIntroCollapsed(null)).toBeNull()
  })
})
