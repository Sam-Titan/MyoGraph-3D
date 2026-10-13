import { useFeatures } from '@/api/queries'
import { vesselTargets } from '@/lib/features'
import { useAppStore } from '@/store/app'

/** Placeholder viewport on the dark navy gradient. The R3F scene lands in Phase 7. */
export function HeartViewport() {
  const { data } = useFeatures()
  const selected = useAppStore((s) => s.selectedTarget)
  const nodes = data ? vesselTargets(data.targets) : []

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="label-caps !text-(--viewport-muted)">3D heart viewport</p>
      <p className="max-w-xs text-sm text-viewport-muted">
        Interactive heart model arrives in Phase 7.
      </p>
      {nodes.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Vessel mesh nodes">
          {nodes.map((t) => (
            <li
              key={t.id}
              data-selected={t.id === selected}
              className="num rounded-md border border-white/15 px-2 py-1 text-xs text-viewport-muted data-[selected=true]:border-white/50 data-[selected=true]:text-viewport-foreground"
            >
              {t.label} · {t.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
