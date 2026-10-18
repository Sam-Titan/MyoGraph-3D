import { useEffect, useReducer } from 'react'
import { useHealth } from '@/api/queries'
import { type WakePhase, wakeElapsedMs, wakePhase } from '@/lib/wake'

/** Where the API is in its cold start; re-evaluated every second while it is still pending. */
export function useServerWake(): WakePhase {
  const { data, isError } = useHealth()
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const pending = !data && !isError
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [pending])
  return wakePhase(data ? 'success' : isError ? 'error' : 'pending', wakeElapsedMs())
}
