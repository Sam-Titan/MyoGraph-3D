import { useMetrics } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'

const pct = (x: number) => `${(x * 100).toFixed(0)}%`

/** Placeholder: proves the metrics data layer. Charts land in a later phase. */
export function PerformancePanel() {
  const metrics = useMetrics()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-(--gutter)">
      <h2 className="text-xl font-semibold tracking-tight">Model performance</h2>
      <QueryBoundary query={metrics} what="metrics">
        {(data) => (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {Object.entries(data.targets).map(([id, t]) => (
              <li key={id} className="flex items-center justify-between px-3 py-2">
                <span>{t.label}</span>
                <span className="num text-xs text-muted-foreground">
                  prevalence {pct(t.prevalence.train)} train · {pct(t.prevalence.test)} hold-out
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </div>
  )
}
