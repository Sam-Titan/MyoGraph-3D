import { useFeatures } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { useAppStore } from '@/store/app'

/** Placeholder: target cards from /api/features wired to the shared selection. */
export function ResultsPanel() {
  const features = useFeatures()
  const selected = useAppStore((s) => s.selectedTarget)
  const setSelected = useAppStore((s) => s.setSelectedTarget)

  return (
    <QueryBoundary query={features} what="targets">
      {(data) => (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-2">
            {data.targets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={t.id === selected}
                  onClick={() => setSelected(t.id)}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent"
                >
                  <span className="label-caps block">{t.id}</span>
                  <span className="text-sm">{t.label}</span>
                  <span className="num block text-xs text-muted-foreground">— %</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Calibrated probabilities and explanations arrive in Phase 5.
          </p>
        </div>
      )}
    </QueryBoundary>
  )
}
