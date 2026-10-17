import type { DisplayConfig, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { pct } from '@/lib/format'

/** The main label: the point estimate against the cut-off, plus "· uncertain" when the range crosses it. */
export function thresholdLabel(range: TargetRange, display: DisplayConfig | undefined): string {
  if (!display) return ''
  const { above, below, uncertain_suffix } = display.threshold_labels
  return `${range.side === 'above' ? above : below}${range.uncertain ? ` · ${uncertain_suffix}` : ''}`
}

/** Label formatter bound to the served wording (config/display.yaml). */
export function useThresholdLabel(): (range: TargetRange) => string {
  const { data } = useDisplay()
  return (range) => thresholdLabel(range, data)
}

/** The sentence under the headline; the cut-off is that target's own, from the API. */
export function labelSentence(
  range: TargetRange,
  threshold: number,
  display: DisplayConfig | undefined,
): string {
  const label = thresholdLabel(range, display)
  if (!label) return ''
  const crossing = range.uncertain ? ' The range crosses the cut-off.' : ''
  return `${label}: the cut-off for this estimate is ${pct(threshold)}.${crossing}`
}
