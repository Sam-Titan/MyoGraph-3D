import { useFeatures, usePresets } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { groupFeatures } from '@/lib/features'

/** Placeholder: proves the features/presets data layer. The form lands in Phase 5. */
export function PatientPanel() {
  const features = useFeatures()
  const presets = usePresets()

  return (
    <div className="space-y-5">
      <QueryBoundary query={presets} what="presets">
        {(list) => (
          <p className="text-sm text-muted-foreground">
            <span className="num text-foreground">{list.length}</span> hold-out presets available.
          </p>
        )}
      </QueryBoundary>
      <QueryBoundary query={features} what="input schema">
        {(data) => (
          <ul className="divide-y rounded-lg border text-sm">
            {groupFeatures(data.features, data.groups).map(({ group, inputs, derived }) => (
              <li key={group.id} className="flex items-center justify-between px-3 py-2">
                <span>{group.label}</span>
                <span className="num text-xs text-muted-foreground">
                  {inputs.length} inputs
                  {derived.length > 0 && ` · ${derived.length} computed`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      <p className="text-xs text-muted-foreground">Patient form arrives in Phase 5.</p>
    </div>
  )
}
