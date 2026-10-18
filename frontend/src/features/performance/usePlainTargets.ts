import type { TargetInfo } from '@/api/client'
import { useFeatures } from '@/api/queries'

/** Target info by id (outcome phrases for the plain sentences); empty until /api/features loads. */
export function usePlainTargets(): Record<string, TargetInfo> {
  const { data } = useFeatures()
  return Object.fromEntries((data?.targets ?? []).map((t) => [t.id, t]))
}
