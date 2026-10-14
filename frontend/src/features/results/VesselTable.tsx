import type { TargetInfo } from '@/api/client'
import type { components } from '@/api/schema'
import { useViewState } from '@/features/heart3d/useViewState'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { TweenedPercent } from './TweenedPercent'

type Prediction = components['schemas']['TargetPrediction']

interface Props {
  vessels: TargetInfo[]
  predictions: Record<string, Prediction> | undefined
  /** Actual catheterisation findings (loaded, unedited preset), if known. */
  truth: Record<string, boolean> | null
  selected: string | null
  onSelect: (id: string) => void
}

/** Probability bar with a tick at the decision threshold. The number is always shown beside it. */
function EstimateBar({ p, threshold }: { p: number; threshold: number }) {
  return (
    <span aria-hidden className="relative mt-1 block h-1.5 w-full rounded-full bg-muted">
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

/** Compact per-vessel table: estimate, the model's verdict, and (unedited preset) the cath result. */
export function VesselTable({ vessels, predictions, truth, selected, onSelect }: Props) {
  const setRowHover = useViewState((s) => s.setRowHover)
  const hovered3d = useViewState((s) => s.hover?.id)
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col className="w-[36%]" />
        <col className="w-[24%]" />
        <col className="w-[17%]" />
        <col className="w-[23%]" />
      </colgroup>
      <thead>
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
      <tbody>
        {vessels.map((t) => {
          const pred = predictions?.[t.id]
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
                'data-[selected=true]:bg-accent data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)]',
              )}
            >
              <th scope="row" className="px-3 py-2 text-left align-top font-normal">
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
              <td className="px-1 py-2 align-top">
                <TweenedPercent
                  value={pred?.probability}
                  className="num block text-[0.9375rem] font-semibold"
                />
                {pred && <EstimateBar p={pred.probability} threshold={pred.threshold} />}
                {pred && <span className="sr-only">threshold {pct(pred.threshold)}</span>}
              </td>
              <td className="px-1 py-2 align-top">
                {pred ? (pred.positive ? 'Likely' : 'Unlikely') : '—'}
              </td>
              <td className="px-1 py-2 align-top">
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
