import { ApiError } from '@/api/client'

/** Render's free plan sleeps the API; a cold start takes up to a minute or two. */
export const WAKE_BUDGET_MS = 150_000
/** After this long the status admits the start is slow. */
export const WAKE_SLOW_MS = 60_000
/** A fast answer shows no "starting" message at all. */
export const WAKE_QUIET_MS = 1_500

let startedAt = Date.now()
let ready = false

/** The first successful /api/health: from now on failures are real errors, not a sleeping server. */
export const markServerReady = (): void => {
  ready = true
}

/** Start a fresh wake window (the visitor pressed Try again). */
export const restartWake = (): void => {
  startedAt = Date.now()
  ready = false
}

export const wakeElapsedMs = (): number => Date.now() - startedAt

/** True while the server may still be starting: queries keep retrying instead of failing. */
export const isWaking = (): boolean => !ready && wakeElapsedMs() < WAKE_BUDGET_MS

/** Network failures and 5xx may be a sleeping server; a 4xx is a real answer. */
export const isTransient = (err: Error): boolean => !(err instanceof ApiError) || err.status >= 500

/** `retry` option: a few quick retries, and as many as the wake window allows while the server starts. */
export const retryWhileWaking =
  (quick: number) =>
  (count: number, err: Error): boolean =>
    isTransient(err) && (count < quick || isWaking())

/** 1 s, 2 s, 4 s, then every 8 s. */
export const wakeDelayMs = (count: number): number => Math.min(8000, 1000 * 2 ** count)

export type WakePhase = 'connecting' | 'waking' | 'slow' | 'ready' | 'failed'

export function wakePhase(status: 'pending' | 'success' | 'error', elapsedMs: number): WakePhase {
  if (status === 'success') return 'ready'
  if (status === 'error') return 'failed'
  if (elapsedMs < WAKE_QUIET_MS) return 'connecting'
  return elapsedMs < WAKE_SLOW_MS ? 'waking' : 'slow'
}

export const WAKE_TEXT: Record<'waking' | 'slow', string> = {
  waking: 'Starting the prediction server (up to a minute on the free plan)…',
  slow: 'Still starting, this can take a couple of minutes on the free plan…',
}
