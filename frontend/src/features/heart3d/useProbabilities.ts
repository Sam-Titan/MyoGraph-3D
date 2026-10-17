import { useMemo } from 'react'
import { useIntervals, usePredict } from '@/api/queries'
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

/** Tuned decision threshold per target id from the same shared predict query. */
export function useThresholds(): Probabilities {
  const values = useAppStore((s) => s.predictValues)
  const { data } = usePredict(values)
  return useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, t] of Object.entries(data?.targets ?? {})) out[id] = t.threshold
    return out
  }, [data])
}

/** Range (as lo/hi probabilities) per target id from the shared intervals query. */
export function useRanges(): Readonly<Record<string, { lo: number; hi: number } | undefined>> {
  const values = useAppStore((s) => s.predictValues)
  const { data } = useIntervals(values)
  return useMemo(() => {
    const out: Record<string, { lo: number; hi: number }> = {}
    for (const [id, r] of Object.entries(data?.targets ?? {})) out[id] = r.interval
    return out
  }, [data])
}
