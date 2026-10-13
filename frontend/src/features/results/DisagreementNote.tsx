import { Info } from 'lucide-react'

/** SPEC 6.2: overall CAD and the vessel models are separate and can give conflicting verdicts. */
export function DisagreementNote() {
  return (
    <p
      role="note"
      className="flex gap-2 rounded-lg border border-notice-border bg-notice px-3 py-2 text-xs text-notice-foreground"
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Overall CAD and each vessel are predicted by separate models and can disagree. In the
        training data, almost every patient with a stenotic vessel was labelled CAD.
      </span>
    </p>
  )
}

/**
 * Tuned verdicts conflict: overall says unlikely but some vessel likely, or overall says likely
 * but no vessel does. Uses the same `positive` flags the cards show.
 */
export function targetsDisagree(overallPositive: boolean, vesselPositives: boolean[]): boolean {
  return overallPositive !== vesselPositives.some(Boolean)
}
