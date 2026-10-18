import { fixed, pm } from '@/lib/format'
import { cn } from '@/lib/utils'
import { makeScale, type Row, signedGap } from './benchmarkModel'

interface Props {
  targetId: string
  targetLabel: string
  color: string
  rows: Row[]
  /** Header of the paired column, e.g. "vs XGBoost". */
  versus: string
}

const pValue = (p: number): string => (p < 0.001 ? '<0.001' : p.toFixed(3))

/** One target: a dot-and-whisker (cross-validated ROC-AUC, mean ± std) beside the other numbers. */
export function BenchTable({ targetId, targetLabel, color, rows, versus }: Props) {
  const { at, lo, hi } = makeScale(rows)
  return (
    <div className="min-w-0 space-y-1">
      <h4 className="text-sm font-medium">
        <span className="num font-semibold">{targetId}</span>{' '}
        <span className="text-muted-foreground">{targetLabel}</span>
      </h4>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-xs">
          <caption className="sr-only">
            {targetLabel}: cross-validated ROC-AUC (mean ± standard deviation over folds), Brier
            score, recall at the tuned cut-off and hold-out ROC-AUC
          </caption>
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-1 pr-2 font-normal">
                Model
              </th>
              <th scope="col" className="w-[38%] py-1 pr-2 font-normal">
                ROC-AUC, cross-validated ({fixed(lo)}–{fixed(hi)})
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">
                Brier
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">
                Recall
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-normal">
                Hold-out ROC-AUC
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                {versus}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { cv, holdout } = r.cell
              const d = r.cell.vs_reference.roc_auc
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {r.label}
                    {r.isReference && <span className="text-muted-foreground"> (reference)</span>}
                  </th>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <div aria-hidden className="relative h-4 min-w-0 flex-1">
                        <span className="absolute top-1/2 h-px w-full bg-border" />
                        <span
                          className="absolute top-1/2 h-0.5 -translate-y-1/2"
                          style={{
                            background: color,
                            left: at(cv.roc_auc.mean - cv.roc_auc.std),
                            width: `calc(${at(cv.roc_auc.mean + cv.roc_auc.std)} - ${at(cv.roc_auc.mean - cv.roc_auc.std)})`,
                          }}
                        />
                        <span
                          className={cn(
                            'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-background',
                            r.isReference ? 'rotate-45 rounded-none' : 'rounded-full',
                          )}
                          style={{ background: color, left: at(cv.roc_auc.mean) }}
                        />
                      </div>
                      <span className="num shrink-0">{pm(cv.roc_auc.mean, cv.roc_auc.std)}</span>
                    </div>
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{pm(cv.brier.mean, cv.brier.std)}</td>
                  <td className="num py-1.5 pr-2 text-right">{fixed(cv.recall.mean)}</td>
                  <td className="num py-1.5 pr-2 text-right">{fixed(holdout.roc_auc)}</td>
                  <td className="num py-1.5 text-right">
                    {r.isReference ? (
                      '—'
                    ) : (
                      <>
                        {signedGap(d.mean_diff)}{' '}
                        <span className="text-muted-foreground">
                          [{fixed(d.ci_lo)}, {fixed(d.ci_hi)}]
                        </span>
                        <br />
                        <span className={d.clear ? 'font-medium' : 'text-muted-foreground'}>
                          {d.clear ? 'clear difference' : 'within the noise'}
                        </span>
                        <span className="text-muted-foreground"> · adj. p {pValue(d.p_adj)}</span>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
