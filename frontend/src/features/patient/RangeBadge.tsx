import { Badge } from '@/components/ui/badge'

export type RangeStatus = 'low' | 'normal' | 'high'

export function rangeStatus(value: number, ref: { low: number; high: number }): RangeStatus {
  if (value < ref.low) return 'low'
  if (value > ref.high) return 'high'
  return 'normal'
}

/** Out-of-reference-range chip. Text carries the meaning; colour is secondary. Normal renders nothing. */
export function RangeBadge({ status }: { status: RangeStatus | null | undefined }) {
  if (status !== 'low' && status !== 'high') return null
  return (
    <Badge variant="outline" className="num border-risk-mid/60 text-foreground">
      {status === 'low' ? '↓ below range' : '↑ above range'}
    </Badge>
  )
}
