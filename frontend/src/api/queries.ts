import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import {
  ApiError,
  getBenchmark,
  getDisplay,
  getFeatures,
  getHealth,
  getMetrics,
  getPresets,
  getStories,
  type PredictRequest,
  postIntervals,
  postPredict,
  postSummary,
} from '@/api/client'
import { isWaking, markServerReady, retryWhileWaking, wakeDelayMs } from '@/lib/wake'

export const queryKeys = {
  health: ['health'] as const,
  features: ['features'] as const,
  presets: ['presets'] as const,
  metrics: ['metrics'] as const,
  benchmark: ['benchmark'] as const,
  stories: ['stories'] as const,
  display: ['display'] as const,
  summary: (values: PredictRequest['values'], selected: string | null) =>
    ['summary', values, selected] as const,
  predict: (values: PredictRequest['values']) => ['predict', values] as const,
  intervals: (values: PredictRequest['values']) => ['intervals', values] as const,
}

const LOADING_RETRY_MS = 3000

/** The server answers 503 while the uncertainty ranges load: retry quietly, up to `max` times. */
const retryWhileLoading = (max: number) => (count: number, err: Error) =>
  err instanceof ApiError && err.status === 503 && count < max

/** The summary keeps retrying a 503 for at least this long before it shows its error state. */
export const SUMMARY_PATIENCE_MS = 120_000

/** Wait the server's Retry-After, kept between 1 s and 10 s so a bad header can't stall or hammer. */
export const retryDelayMs = (err: Error): number =>
  Math.min(
    10_000,
    Math.max(1000, (err instanceof ApiError && err.retryAfterMs) || LOADING_RETRY_MS),
  )

/** True while a failed query is only waiting for the server to finish loading its ranges. */
export const isPreparing = (err: Error | null): boolean =>
  err instanceof ApiError && err.status === 503

/**
 * The wake probe: fired on first render, retried with backoff for the whole wake window (no toast,
 * no error until it is spent). The first success ends the window for every other query.
 */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      const health = await getHealth(signal)
      markServerReady()
      return health
    },
    retry: () => isWaking(),
    retryDelay: wakeDelayMs,
  })
}

// Features, presets and metrics are fixed for a given model version: fetch once.
export function useFeatures() {
  return useQuery({
    queryKey: queryKeys.features,
    queryFn: ({ signal }) => getFeatures(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function usePresets() {
  return useQuery({
    queryKey: queryKeys.presets,
    queryFn: ({ signal }) => getPresets(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useDisplay() {
  return useQuery({
    queryKey: queryKeys.display,
    queryFn: ({ signal }) => getDisplay(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useStories() {
  return useQuery({
    queryKey: queryKeys.stories,
    queryFn: ({ signal }) => getStories(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: ({ signal }) => getMetrics(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

// Precomputed by `make benchmark`: fixed for a given model version.
export function useBenchmark() {
  return useQuery({
    queryKey: queryKeys.benchmark,
    queryFn: ({ signal }) => getBenchmark(signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** `values` should already be debounced and zod-valid; pass `null` to send nothing. */
export function usePredict(values: PredictRequest['values'] | null) {
  return useQuery({
    queryKey: queryKeys.predict(values ?? {}),
    queryFn: ({ signal }) => postPredict({ values: values ?? {} }, signal),
    enabled: values !== null,
    // A 4xx is a deterministic rejection (e.g. 422 field errors): surface it, don't retry. A 5xx or
    // network error keeps retrying while the server is still waking.
    retry: retryWhileWaking(2),
    retryDelay: wakeDelayMs,
    placeholderData: keepPreviousData,
  })
}

/**
 * Plain-language summary: never fetched automatically. `refetch()` is the button; the result is
 * cached per prediction values and selected target, so it shows again for identical inputs and is gone once they change.
 */
export function useSummary(values: PredictRequest['values'] | null, selected: string | null) {
  const firstFailureAt = useRef(0)
  return useQuery({
    queryKey: queryKeys.summary(values ?? {}, selected),
    queryFn: ({ signal }) =>
      postSummary({ values: values ?? {}, selected_target: selected }, signal),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: (count, err) => {
      if (count === 0) firstFailureAt.current = Date.now()
      return isPreparing(err) && Date.now() - firstFailureAt.current < SUMMARY_PATIENCE_MS
    },
    retryDelay: (_count, err) => retryDelayMs(err),
  })
}

/**
 * Bootstrap ranges for the same values. A second call so /api/predict stays fast: the point
 * estimate renders first and the range follows.
 */
export function useIntervals(values: PredictRequest['values'] | null) {
  return useQuery({
    queryKey: queryKeys.intervals(values ?? {}),
    queryFn: ({ signal }) => postIntervals({ values: values ?? {} }, signal),
    enabled: values !== null,
    placeholderData: keepPreviousData,
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryWhileLoading(150),
    retryDelay: LOADING_RETRY_MS,
  })
}
