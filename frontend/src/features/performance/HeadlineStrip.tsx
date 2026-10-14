import type { MetricsResponse } from '@/api/client'
import { fixed, pm } from '@/lib/format'
import { targetIds } from './performanceModel'

/** One tile per target: cross-validated ROC-AUC (primary) and hold-out ROC-AUC (secondary). */
export function HeadlineStrip({ metrics }: { metrics: MetricsResponse }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      {targetIds(metrics).map((id) => {
        const t = metrics.targets[id]
        const auc = t.cv.default.roc_auc
        return (
          <li key={id} className="min-w-0 border-t pt-3">
            <p className="truncate text-xs text-muted-foreground">
              <span className="num font-semibold text-foreground">{id}</span> {t.label}
            </p>
            <p className="num text-2xl font-semibold">{pm(auc.mean, auc.std)}</p>
            <p className="text-xs text-muted-foreground">ROC-AUC, cross-validated on train</p>
            <p className="mt-1 text-xs">
              <span className="num font-semibold">{fixed(t.test.default.roc_auc)}</span>{' '}
              <span className="text-muted-foreground">hold-out</span>
            </p>
          </li>
        )
      })}
    </ul>
  )
}
