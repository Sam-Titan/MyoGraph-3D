import type { TargetInfo } from '@/api/client'
import { pct, pctRange } from '@/lib/format'
import type { Probabilities, useRanges } from './useProbabilities'
import { useViewState } from './useViewState'

/** Name + % next to the pointer. Plain DOM (no <Html>) so it costs nothing per frame. */
export function HoverTooltip({
  targets,
  probabilities,
  ranges,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  ranges: ReturnType<typeof useRanges>
}) {
  const hover = useViewState((s) => s.hover)
  const target = hover ? targets.find((t) => t.id === hover.id) : undefined
  if (!hover || !target) return null
  const range = ranges[target.id]
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 rounded-md border border-white/20 bg-slate-950/85 px-2 py-1 text-xs text-white shadow-md"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      <span>{target.label}</span>{' '}
      <span className="num font-semibold">{pct(probabilities[target.id])}</span>
      {range && <span className="num text-white/70"> (range {pctRange(range.lo, range.hi)})</span>}
    </div>
  )
}
