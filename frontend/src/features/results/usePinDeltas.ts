import { useMemo } from 'react'
import { useProbabilities } from '@/features/heart3d/useProbabilities'
import { useAppStore } from '@/store/app'
import { type Delta, pinDeltas } from './pinModel'

/** Change per target against the pinned result; empty when nothing is pinned. */
export function usePinDeltas(): Readonly<Record<string, Delta>> {
  const pinned = useAppStore((s) => s.pinned)
  const probabilities = useProbabilities()
  return useMemo(() => pinDeltas(pinned, probabilities), [pinned, probabilities])
}
