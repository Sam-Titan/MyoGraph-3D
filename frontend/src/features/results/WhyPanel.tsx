import type { TargetInfo } from '@/api/client'
import type { components } from '@/api/schema'
import { pct, signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type WhyRow, whyRows } from './whyModel'

type Explanation = components['schemas']['TargetExplanation']

const rowTitle = (r: WhyRow): string =>
  `${r.axis} · ${signed(r.logit)} log-odds (${r.logit >= 0 ? 'raises' : 'lowers'} the estimate)`

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

interface Props {
  target: TargetInfo
  explanation: Explanation
  probability: number
}

/** SPEC 6.2 WHY panel: diverging SHAP contributions (log-odds) for the selected target. */
export function WhyPanel({ target, explanation, probability }: Props) {
  const rows = whyRows(explanation)
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.logit)), 0)

  return (
    <section aria-label={`Why: ${target.id}`} className="space-y-2">
      <h3 className="label-caps">Why · {target.label}</h3>
      <p className="text-sm">
        Average patient (model baseline){' '}
        <span className="num font-semibold">{pct(explanation.base_probability)}</span>
        <span aria-hidden> → </span>
        <span className="sr-only"> to </span>
        this patient <span className="num font-semibold">{pct(probability)}</span>
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[11px] text-muted-foreground">
        <span aria-hidden />
        <span aria-hidden className="text-center">
          ← lowers · contribution (log-odds) · raises →
        </span>
      </div>
      <ul className="divide-y" aria-hidden>
        {rows.map((r) => (
          <li
            key={r.key}
            title={rowTitle(r)}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 py-1"
          >
            <span className="line-clamp-2 min-w-0 break-words text-xs leading-snug">{r.axis}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Bar row={r} max={max} />
              <span className="num w-11 shrink-0 text-right text-xs">{signed(r.logit)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Bars show how much each factor pushed this estimate up or down relative to the average
        patient.
      </p>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.key}>
            {r.axis}: {signed(r.logit)} log-odds, {r.logit >= 0 ? 'raises' : 'lowers'} the estimate
          </li>
        ))}
      </ul>
    </section>
  )
}
