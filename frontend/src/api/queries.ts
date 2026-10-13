import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ApiError,
  getFeatures,
  getHealth,
  getMetrics,
  getPresets,
  type PredictRequest,
  postPredict,
} from '@/api/client'

export const queryKeys = {
  health: ['health'] as const,
  features: ['features'] as const,
  presets: ['presets'] as const,
  metrics: ['metrics'] as const,
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
