import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ApiError,
  getFeatures,
  getHealth,
  getMetrics,
  getPresets,
  getStories,
  type PredictRequest,
  postPredict,
  postSummary,
} from '@/api/client'

export const queryKeys = {
  health: ['health'] as const,
  features: ['features'] as const,
  presets: ['presets'] as const,
  metrics: ['metrics'] as const,
  stories: ['stories'] as const,
  summary: (values: PredictRequest['values'], selected: string | null) =>
    ['summary', values, selected] as const,
  predict: (values: PredictRequest['values']) => ['predict', values] as const,
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
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

/** `values` should already be debounced and zod-valid; pass `null` to send nothing. */
export function usePredict(values: PredictRequest['values'] | null) {
  return useQuery({
    queryKey: queryKeys.predict(values ?? {}),
    queryFn: ({ signal }) => postPredict({ values: values ?? {} }, signal),
    enabled: values !== null,
    // A 4xx is a deterministic rejection (e.g. 422 field errors): surface it, don't retry.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    placeholderData: keepPreviousData,
  })
}

/**
 * Plain-language summary: never fetched automatically. `refetch()` is the button; the result is
 * cached per prediction values and selected target, so it shows again for identical inputs and is gone once they change.
 */
export function useSummary(values: PredictRequest['values'] | null, selected: string | null) {
  return useQuery({
    queryKey: queryKeys.summary(values ?? {}, selected),
    queryFn: ({ signal }) =>
      postSummary({ values: values ?? {}, selected_target: selected }, signal),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}
