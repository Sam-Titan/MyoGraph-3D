import type { TargetInfo } from '@/api/client'
import { type Probabilities, pctLabel } from './useProbabilities'
import { useViewState } from './useViewState'

/** Name + % next to the pointer. Plain DOM (no <Html>) so it costs nothing per frame. */
export function HoverTooltip({
  targets,
  probabilities,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
}) {
  const hover = useViewState((s) => s.hover)
  const target = hover ? targets.find((t) => t.id === hover.id) : undefined
  if (!hover || !target) return null
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 rounded-md border border-white/20 bg-slate-950/85 px-2 py-1 text-xs text-white shadow-md"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      <span>{target.label}</span>{' '}
      <span className="num font-semibold">{pctLabel(probabilities[target.id])}</span>
    </div>
  )
}
