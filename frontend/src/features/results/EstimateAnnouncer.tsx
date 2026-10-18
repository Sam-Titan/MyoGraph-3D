import { useFeatures } from '@/api/queries'
import { useProbabilities } from '@/features/heart3d/useProbabilities'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { announcement } from './estimateAnnouncement'

/** Screen-reader live region: says the new numbers once typing in the form has paused (never visible). */
export function EstimateAnnouncer() {
  const targets = useFeatures().data?.targets ?? []
  const text = useDebouncedValue(announcement(targets, useProbabilities()), 1500)
  return (
    <p role="status" aria-live="polite" aria-atomic className="sr-only" data-testid="announcer">
      {text}
    </p>
  )
}
