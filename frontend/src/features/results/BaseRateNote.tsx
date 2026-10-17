import type { TargetInfo } from '@/api/client'
import { useDisplay, useMetrics } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { baseRateLines } from '@/lib/plain'

/**
 * Always beside the results: who the numbers come from, and that they are not a personal risk.
 * Uses the selected target's own outcome and dataset prevalence (a vessel is not CAD).
 */
export function BaseRateNote({ target }: { target: TargetInfo | undefined }) {
  const { data: display } = useDisplay()
  const { data: metrics } = useMetrics()
  if (!display || !metrics || !target) return null
  const [line1, line2] = baseRateLines(display, metrics, target)
  return (
    <p
      role="note"
      data-testid="base-rate-note"
      className="rounded-md bg-notice px-3 py-2 text-xs leading-snug text-notice-foreground"
    >
      <GlossaryText text={line1} /> {line2}
    </p>
  )
}
