import { useFeatures, usePredict } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { usePresetTruth } from '@/features/patient/usePresetTruth'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

const pct = (p: number): string => `${(p * 100).toFixed(1)}%`

/**
 * Temporary readout (replaced in Phase 8): every target from /api/features with its calibrated
 * model estimate, wired to the shared selection. Numbers are always shown.
 */
export function ResultsPanel() {
  const features = useFeatures()
  const predictValues = useAppStore((s) => s.predictValues)
  const predict = usePredict(predictValues)
  const selected = useAppStore((s) => s.selectedTarget)
  const setSelected = useAppStore((s) => s.setSelectedTarget)
  const { truth, edited } = usePresetTruth()

  const stale = predict.isFetching || predict.isPlaceholderData

  return (
    <QueryBoundary query={features} what="targets">
      {(data) => (
        <div className="space-y-4">
          <ul className={cn('grid grid-cols-2 gap-2 transition-opacity', stale && 'opacity-60')}>
            {data.targets.map((t) => {
              const result = predict.data?.targets[t.id]
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={t.id === selected}
                    onClick={() => setSelected(t.id)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent"
                  >
                    <span className="label-caps block">{t.id}</span>
                    <span className="text-sm">{t.label}</span>
                    <span className="num block text-lg font-semibold">
                      {result ? pct(result.probability) : '—'}
                    </span>
                    {result && (
                      <span className="block text-xs text-muted-foreground">
                        model estimate · {result.positive ? 'above' : 'below'} threshold{' '}
                        {pct(result.threshold)}
                      </span>
                    )}
                    {truth && t.id in truth && (
                      <span className="block text-xs text-muted-foreground">
                        Actual (catheterisation): {truth[t.id] ? 'positive' : 'negative'}
                        {edited && ' · patient edited since preset'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {predict.isError && (
            <p role="alert" className="text-xs text-destructive">
              Couldn’t get a prediction for these values.
            </p>
          )}
          {predict.data && predict.data.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {predict.data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </QueryBoundary>
  )
}
