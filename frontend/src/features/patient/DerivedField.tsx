import type { BreakdownRow, FeatureInfo } from '@/api/client'
import { cn } from '@/lib/utils'
import { RangeBadge } from './RangeBadge'

export interface DerivedState {
  /** Latest predict breakdown rows by id; null until a prediction exists. */
  rows: ReadonlyMap<string, BreakdownRow> | null
  /** Form currently valid: when false derived values are blanked rather than shown stale. */
  valid: boolean
  /** Value lags the form (debouncing / refetching): keep it visible but dimmed. */
  dimmed: boolean
}

function format(row: BreakdownRow): string {
  if (row.unit) {
    const unit = row.value === 1 && row.unit_singular ? row.unit_singular : row.unit
    return `${Number(row.value.toFixed(1))} ${unit}`
  }
  if (row.value === 0 || row.value === 1) return row.value === 1 ? 'Yes' : 'No'
  return String(Number(row.value.toFixed(2)))
}

/** Read-only; the value always comes from the backend's `breakdown` (matched by id). */
export function DerivedField({ feature, state }: { feature: FeatureInfo; state: DerivedState }) {
  const row = state.valid ? state.rows?.get(feature.id) : undefined
  return (
    <div className="flex min-h-8 items-center gap-2" data-testid={`derived-${feature.id}`}>
      <span
        className={cn(
          'num text-sm transition-opacity',
          row ? 'font-medium' : 'text-muted-foreground',
          row && state.dimmed && 'opacity-50',
        )}
      >
        {row ? format(row) : '—'}
      </span>
      {row && <RangeBadge status={row.status} />}
      <span className="text-xs text-muted-foreground">computed</span>
    </div>
  )
}
