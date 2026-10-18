import { cn } from '@/lib/utils'
import { type Delta, deltaText, WITHIN_UNCERTAINTY } from './pinModel'

/** `81% → 64% ▼17`; a second line says so when the new estimate is still inside the pinned range. */
export function PinDelta({
  delta,
  prefix = '',
  className,
}: {
  delta: Delta | undefined
  prefix?: string
  className?: string
}) {
  if (!delta) return null
  return (
    <span data-testid="pin-delta" className={cn('t-meta block', className)}>
      {prefix}
      {deltaText(delta)}
      {delta.withinUncertainty && delta.points !== 0 && (
        <span className="block">{WITHIN_UNCERTAINTY}</span>
      )}
    </span>
  )
}
