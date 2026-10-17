import type { MetricsResponse } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { fixed, pm } from '@/lib/format'
import { rocAucLine } from '@/lib/plain'
import { targetIds } from './performanceModel'
import { usePlainTargets } from './usePlainTargets'

/** One tile per target: cross-validated ROC-AUC (primary) and hold-out ROC-AUC (secondary). */
export function HeadlineStrip({ metrics }: { metrics: MetricsResponse }) {
  const { data: display } = useDisplay()
  const targets = usePlainTargets()
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
            {display && targets[id] && (
              <p className="mt-1 text-xs leading-snug text-muted-foreground" data-testid="auc-line">
                <GlossaryText text={rocAucLine(display, metrics, targets[id])} />
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
