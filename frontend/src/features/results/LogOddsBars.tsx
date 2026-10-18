import type { components } from '@/api/schema'
import { useStory } from '@/features/story/useStory'
import { signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type WhyRow, whyRows } from './whyModel'

type Explanation = components['schemas']['TargetExplanation']

const rowTitle = (r: WhyRow): string =>
  `${r.axis}: ${signed(r.logit)} log-odds (${r.logit >= 0 ? 'raises' : 'lowers'} the estimate)`

/** Diverging bar centred at 0; its length is relative to the largest |contribution| shown. */
function Bar({ row, max }: { row: WhyRow; max: number }) {
  const half = max > 0 ? Math.min(50, (Math.abs(row.logit) / max) * 50) : 0
  const up = row.logit >= 0
  return (
    <span aria-hidden className="relative block h-3.5 min-w-0 flex-1">
      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <span
        className={cn(
          'absolute inset-y-0.5 rounded-sm',
          up ? 'bg-contrib-up' : 'bg-contrib-down',
          row.other && 'opacity-55',
        )}
        style={up ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
      />
    </span>
  )
}

/** The log-odds (SHAP) view: diverging bars for the top inputs plus one aggregated bar. */
export function LogOddsBars({
  targetId,
  explanation,
}: {
  targetId: string
  explanation: Explanation
}) {
  const rows = whyRows(explanation)
  const hl = useStory((s) => s.highlight)
  const marked = new Set(hl?.target === targetId ? hl.ids : [])
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.logit)), 0)
  return (
    <div className="space-y-2">
      <div
        aria-hidden
        title="Contribution to the estimate, in log-odds"
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-xs whitespace-nowrap text-muted-foreground"
      >
        <span />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="relative flex min-w-0 flex-1 justify-between">
            <span>← lowers</span>
            <span>raises →</span>
          </span>
          <span className="w-11 shrink-0" />
        </span>
      </div>
      <ul className="divide-y" aria-hidden>
        {rows.map((r) => (
          <li
            key={r.key}
            title={rowTitle(r)}
            data-highlight={marked.has(r.key) || undefined}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 py-1 data-[highlight]:rounded data-[highlight]:bg-primary/10 data-[highlight]:ring-2 data-[highlight]:ring-primary/50"
          >
            <span className="line-clamp-2 min-w-0 break-words text-xs leading-snug">{r.axis}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Bar row={r} max={max} />
              <span className="num w-11 shrink-0 text-right text-xs">{signed(r.logit)}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.key}>
            {r.axis}: {signed(r.logit)} log-odds, {r.logit >= 0 ? 'raises' : 'lowers'} the estimate
          </li>
        ))}
      </ul>
    </div>
  )
}
