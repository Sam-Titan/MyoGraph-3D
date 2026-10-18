import type { TargetInfo, TargetRange } from '@/api/client'
import type { components } from '@/api/schema'
import { useViewState } from '@/features/heart3d/useViewState'
import { pct, pctRange } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { PinDelta } from './PinDelta'
import type { Delta } from './pinModel'
import { TweenedPercent } from './TweenedPercent'
import { useThresholdParts } from './verdict'

type Prediction = components['schemas']['TargetPrediction']

interface Props {
  vessels: TargetInfo[]
  predictions: Record<string, Prediction> | undefined
  ranges: Record<string, TargetRange> | undefined
  deltas?: Readonly<Record<string, Delta>>
  /** Actual catheterisation findings (loaded, unedited preset), if known. */
  truth: Record<string, boolean> | null
  selected: string | null
  onSelect: (id: string) => void
}

/** Probability bar: lighter segment = range, tick = the model's cut-off. The number is always shown beside it. */
function EstimateBar({
  p,
  threshold,
  range,
}: {
  p: number
  threshold: number
  range: TargetRange['interval'] | undefined
}) {
  return (
    <span aria-hidden className="relative mt-1 block h-1.5 w-full rounded-full bg-muted">
      {range && (
        <span
          className="absolute -inset-y-0.5 rounded-full bg-foreground/15"
          style={{ left: `${range.lo * 100}%`, width: `${(range.hi - range.lo) * 100}%` }}
        />
      )}
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${p * 100}%`, background: riskCss(p) }}
      />
      <span
        className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground"
        style={{ left: `calc(${threshold * 100}% - 1px)` }}
      />
    </span>
  )
}

/** Compact per-vessel table: estimate, where it sits against the model's cut-off, and (unedited preset) the cath result. */
export function VesselTable({
  vessels,
  predictions,
  ranges,
  deltas,
  truth,
  selected,
  onSelect,
}: Props) {
  const setRowHover = useViewState((s) => s.setRowHover)
  const hovered3d = useViewState((s) => s.hover?.id)
  const thresholdParts = useThresholdParts()
  return (
    /* Below sm each vessel becomes a stacked card (4 columns do not fit 360 px). */
    <table className="w-full table-fixed border-collapse text-sm max-sm:block">
      <colgroup className="max-sm:hidden">
        <col className="w-[22%]" />
        <col className="w-[29%]" />
        <col className="w-[30%]" />
        <col className="w-[19%]" />
      </colgroup>
      <thead className="max-sm:hidden">
        <tr className="t-meta text-left">
          <th scope="col" className="px-3 pb-1 font-medium">
            Vessel
          </th>
          <th scope="col" className="px-1 pb-1 font-medium">
            Estimate
          </th>
          <th scope="col" className="px-1 pb-1 font-medium">
            Model
          </th>
          <th scope="col" className="px-1 pb-1 font-medium">
            Cath result
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:block">
        {vessels.map((t) => {
          const pred = predictions?.[t.id]
          const range = ranges?.[t.id]
          const actual = truth?.[t.id]
          const agrees = actual !== undefined && pred ? actual === pred.positive : undefined
          const isSelected = t.id === selected
          return (
            <tr
              key={t.id}
              data-selected={isSelected}
              data-linked={hovered3d === t.id}
              onClick={() => onSelect(t.id)}
              onPointerEnter={() => setRowHover(t.id)}
              onPointerLeave={() => setRowHover(null)}
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted data-[linked=true]:bg-muted',
                'max-sm:mb-2 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:rounded-lg max-sm:border max-sm:p-2',
                'data-[selected=true]:bg-accent data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)]',
              )}
            >
              <th
                scope="row"
                className="px-3 py-2 text-left align-top font-normal max-sm:col-span-2 max-sm:px-1 max-sm:py-1"
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onFocus={() => setRowHover(t.id)}
                  onBlur={() => setRowHover(null)}
                  className="block w-full min-w-0 rounded-sm text-left"
                >
                  <span className="block font-semibold">{t.id}</span>
                  <span className="t-meta block">{t.plain_label}</span>
                </button>
              </th>
              <td className="px-1 py-2 align-top max-sm:px-1 max-sm:py-1">
                <span className="t-meta block sm:hidden">Estimate</span>
                <span className="block text-[0.9375rem] leading-tight">
                  <TweenedPercent value={pred?.probability} className="num font-semibold" />
                  {range && (
                    <span className="num t-meta ml-1 inline-block">
                      ({pctRange(range.interval.lo, range.interval.hi)})
                    </span>
                  )}
                </span>
                {pred ? (
                  <EstimateBar
                    p={pred.probability}
                    threshold={pred.threshold}
                    range={range?.interval}
                  />
                ) : (
                  // Same height as the bar: the row does not grow when the estimate arrives.
                  <span aria-hidden className="mt-1 block h-1.5" />
                )}
                <PinDelta delta={deltas?.[t.id]} className="mt-1" />
                {pred && (
                  <span className="sr-only">
                    {range &&
                      `range ${Math.round(range.interval.lo * 100)} to ${Math.round(range.interval.hi * 100)} percent, `}
                    cut-off {pct(pred.threshold)}
                  </span>
                )}
              </td>
              <td className="px-1 py-2 align-top text-[0.8125rem] leading-snug max-sm:px-1 max-sm:py-1">
                <span className="t-meta block sm:hidden">Model</span>
                {/* Two lines reserved (verdict + qualifier) so the ranges arriving do not shift the page. */}
                <div className="min-h-[2.6em]">
                  {range ? (
                    <>
                      <span className="block">{thresholdParts(range).main}</span>
                      {thresholdParts(range).qualifier && (
                        <span className="t-meta block">{thresholdParts(range).qualifier}</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              </td>
              <td className="px-1 py-2 align-top max-sm:col-span-2 max-sm:px-1 max-sm:py-1">
                <span className="t-meta block sm:hidden">Cath result</span>
                {actual === undefined ? (
                  <span className="t-meta">—</span>
                ) : (
                  <>
                    <span className="block">{actual ? 'Stenotic' : 'Normal'}</span>
                    {agrees !== undefined && (
                      <span
                        className={cn(
                          'block text-xs font-medium',
                          agrees ? 'text-muted-foreground' : 'text-destructive',
                        )}
                      >
                        {agrees ? '✓ agrees' : '✗ misses'}
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
