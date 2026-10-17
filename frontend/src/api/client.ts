import type { components } from '@/api/schema'

type Schemas = components['schemas']

export type HealthResponse = Schemas['HealthResponse']
export type FeaturesResponse = Schemas['FeaturesResponse']
export type FeatureInfo = Schemas['FeatureInfo']
export type GroupInfo = Schemas['GroupInfo']
export type TargetInfo = Schemas['TargetInfo']
export type Preset = Schemas['Preset']
export type BreakdownRow = Schemas['BreakdownRow']
export type PredictRequest = Schemas['PredictRequest']
export type PredictResponse = Schemas['PredictResponse']
export type IntervalsResponse = Schemas['IntervalsResponse']
export type TargetRange = Schemas['TargetRange']
export type Verdict = TargetRange['verdict']
export type SummaryRequest = Schemas['SummaryRequest']
export type SummaryResponse = Schemas['SummaryResponse']
export type MetricsResponse = Schemas['MetricsResponse']
export type Stories = Schemas['Stories']
export type Story = Schemas['Story']
export type StoryStep = Schemas['Step']
export type StoryPart = Schemas['Part']

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(`API request failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    const detail: unknown = await res.json().catch(() => null)
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const getHealth = (signal?: AbortSignal) => apiFetch<HealthResponse>('/health', { signal })
export const getFeatures = (signal?: AbortSignal) =>
  apiFetch<FeaturesResponse>('/features', { signal })
export const getPresets = (signal?: AbortSignal) => apiFetch<Preset[]>('/presets', { signal })
export const getStories = (signal?: AbortSignal) => apiFetch<Stories>('/stories', { signal })
export const getMetrics = (signal?: AbortSignal) =>
  apiFetch<MetricsResponse>('/metrics', { signal })

export const postPredict = (body: PredictRequest, signal?: AbortSignal) =>
  apiFetch<PredictResponse>('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export const postIntervals = (body: PredictRequest, signal?: AbortSignal) =>
  apiFetch<IntervalsResponse>('/intervals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export const postSummary = (body: SummaryRequest, signal?: AbortSignal) =>
  apiFetch<SummaryResponse>('/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
