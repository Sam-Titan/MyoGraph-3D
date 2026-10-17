import { afterEach, describe, expect, it, vi } from 'vitest'
import { postIntervals } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('postIntervals', () => {
  it('passes the abort signal to fetch, so a superseded request is cancelled', async () => {
    let seen: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        seen = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          seen?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }),
    )
    const ctl = new AbortController()
    const pending = postIntervals({ values: { age: 50 } }, ctl.signal)
    expect(seen).toBe(ctl.signal)
    ctl.abort()
    await expect(pending).rejects.toThrow('aborted')
    expect(seen?.aborted).toBe(true)
  })
})
