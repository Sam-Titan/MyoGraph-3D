import type { DisplayConfig, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { pct } from '@/lib/format'
import { fillText } from '@/lib/template'

/** The main label (point estimate vs the cut-off) and the "uncertain" qualifier when the range crosses it. */
export function thresholdParts(
  range: TargetRange,
  display: DisplayConfig | undefined,
): { main: string; qualifier: string | null } {
  if (!display) return { main: '', qualifier: null }
  const { above, below, uncertain_suffix } = display.threshold_labels
  return {
    main: range.side === 'above' ? above : below,
    qualifier: range.uncertain ? uncertain_suffix : null,
  }
}

/** "Above the model's cut-off · uncertain" as one string. */
export function thresholdLabel(range: TargetRange, display: DisplayConfig | undefined): string {
  const { main, qualifier } = thresholdParts(range, display)
  return qualifier ? `${main} · ${qualifier}` : main
}

/** Parts formatter bound to the served wording (config/display.yaml). */
export function useThresholdParts(): (range: TargetRange) => {
  main: string
  qualifier: string | null
} {
  const { data } = useDisplay()
  return (range) => thresholdParts(range, data)
}

/** The line under a headline: the label, then that target's own cut-off (and the range note). */
export function labelSentence(
  range: TargetRange,
  threshold: number,
  display: DisplayConfig | undefined,
): string {
  const label = thresholdLabel(range, display)
  if (!display || !label) return ''
  const cutoff = fillText(display.cutoff_line, { thr: pct(threshold) })
  return `${label}. ${cutoff}${range.uncertain ? ` ${display.cutoff_crosses}` : ''}`
}
