import { useEffect } from 'react'
import { useFeatures } from '@/api/queries'
import { overallTarget } from '@/lib/features'
import { useAppStore } from '@/store/app'

/** Selects the overall target once /api/features loads, unless the user already chose one. */
export function useInitSelectedTarget() {
  const { data } = useFeatures()
  const selected = useAppStore((s) => s.selectedTarget)
  const setSelectedTarget = useAppStore((s) => s.setSelectedTarget)

  useEffect(() => {
    if (selected !== null || !data) return
    const overall = overallTarget(data.targets)
    if (overall) setSelectedTarget(overall.id)
  }, [data, selected, setSelectedTarget])
}
