import { useMemo } from 'react'
import { usePredict } from '@/api/queries'
import { useAppStore } from '@/store/app'

export type Probabilities = Readonly<Record<string, number | undefined>>

/** Calibrated probability per target id from the shared live-predict query (empty until first result). */
export function useProbabilities(): Probabilities {
  const values = useAppStore((s) => s.predictValues)
  const { data } = usePredict(values)
  return useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, t] of Object.entries(data?.targets ?? {})) out[id] = t.probability
    return out
  }, [data])
}

export const pctLabel = (p: number | undefined): string =>
  p === undefined ? '—' : `${Math.round(p * 100)}%`
