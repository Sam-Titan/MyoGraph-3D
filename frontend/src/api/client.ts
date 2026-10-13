import type { components } from '@/api/schema'

export type HealthResponse = components['schemas']['HealthResponse']

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal })
  if (!res.ok) throw new Error(`health check failed: ${res.status}`)
  return res.json() as Promise<HealthResponse>
}
