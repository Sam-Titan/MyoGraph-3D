import { ApiError } from '@/api/client'

/** Field-level messages from a FastAPI 422 body (`{detail:[{loc:[..., id], msg}]}`), keyed by input id. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 422) return {}
  const body = error.detail
  if (typeof body !== 'object' || body === null || !('detail' in body)) return {}
  const items: unknown = body.detail
  if (!Array.isArray(items)) return {}
  const out: Record<string, string> = {}
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const { loc, msg } = item as { loc?: unknown; msg?: unknown }
    const id = Array.isArray(loc) ? loc[loc.length - 1] : undefined
    if (typeof id === 'string' && typeof msg === 'string') out[id] = msg
  }
  return out
}
