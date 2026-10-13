import type { components } from '@/api/schema'

type Explanation = components['schemas']['TargetExplanation']

export const TOP_N = 10

export interface WhyRow {
  key: string
  /** Y-axis text: "<label>: <display value>", or "N other features". */
  axis: string
  label: string
  displayValue: string | null
  logit: number
  other: boolean
}

/**
 * Top N contributions (the API sorts by |logit| desc) plus one aggregated bar for the rest.
 * The bars plus the base logit sum exactly to the calibrated logit.
 */
export function whyRows(explanation: Explanation, topN = TOP_N): WhyRow[] {
  const top = explanation.contributions.slice(0, topN).map((c) => ({
    key: c.id,
    axis: `${c.label}: ${c.display_value}`,
    label: c.label,
    displayValue: c.display_value,
    logit: c.logit,
    other: false,
  }))
  const rest = explanation.contributions.slice(topN)
  if (rest.length === 0) return top
  const label = `${rest.length} other features`
  return [
    ...top,
    {
      key: '__other__',
      axis: label,
      label,
      displayValue: null,
      logit: rest.reduce((sum, c) => sum + c.logit, 0),
      other: true,
    },
  ]
}
