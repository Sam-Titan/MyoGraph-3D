import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, postIntervals } from './client'
import { retryDelayMs } from './queries'

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

describe('Retry-After', () => {
  it('is carried on the ApiError and clamped into a sane retry delay', async () => {
    const fail = (header: string | null) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('{}', { status: 503, headers: header ? { 'Retry-After': header } : {} }),
        ),
      )
    fail('5')
    const err = await postIntervals({ values: {} }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).retryAfterMs).toBe(5000)
    expect(retryDelayMs(err as ApiError)).toBe(5000)
    fail('600')
    expect(
      retryDelayMs((await postIntervals({ values: {} }).catch((e: unknown) => e)) as ApiError),
    ).toBe(10_000)
    fail(null)
    const none = (await postIntervals({ values: {} }).catch((e: unknown) => e)) as ApiError
    expect(none.retryAfterMs).toBeNull()
    expect(retryDelayMs(none)).toBe(3000)
  })
})
