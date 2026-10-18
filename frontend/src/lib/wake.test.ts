import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  isTransient,
  retryWhileWaking,
  WAKE_QUIET_MS,
  WAKE_SLOW_MS,
  wakeDelayMs,
  wakePhase,
} from './wake'

describe('wakePhase', () => {
  it('stays quiet for a fast server, then waking, then slow', () => {
    expect(wakePhase('pending', WAKE_QUIET_MS - 1)).toBe('connecting')
    expect(wakePhase('pending', WAKE_QUIET_MS)).toBe('waking')
    expect(wakePhase('pending', WAKE_SLOW_MS - 1)).toBe('waking')
    expect(wakePhase('pending', WAKE_SLOW_MS)).toBe('slow')
  })
  it('success wins at any time, an error is final', () => {
    expect(wakePhase('success', 999_999)).toBe('ready')
    expect(wakePhase('error', 10)).toBe('failed')
  })
})

describe('retries', () => {
  it('treats network errors and 5xx as transient, 4xx as answers', () => {
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransient(new ApiError(502, null))).toBe(true)
    expect(isTransient(new ApiError(422, null))).toBe(false)
  })
  it('never retries a 4xx, and retries a 5xx while the window is open', () => {
    const retry = retryWhileWaking(2)
    expect(retry(0, new ApiError(422, null))).toBe(false)
    expect(retry(1, new ApiError(503, null))).toBe(true)
    expect(retry(50, new ApiError(503, null))).toBe(true) // fresh page load: still inside the window
  })
  it('backs off to 8 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(wakeDelayMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
  })
})
