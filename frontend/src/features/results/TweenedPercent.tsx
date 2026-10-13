import { pct } from '@/lib/format'
import { useTween } from './useTween'

/** Integer % that eases between predictions; the rounding rule is `pct` everywhere. */
export function TweenedPercent({
  value,
  className,
}: {
  value: number | undefined
  className?: string
}) {
  const shown = useTween(value)
  return <span className={className}>{pct(shown)}</span>
}
