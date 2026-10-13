import { Html } from '@react-three/drei'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import type { NodeBinding } from './useHeartModel'
import { type Probabilities, pctLabel } from './useProbabilities'
import { useViewState } from './useViewState'

interface Props {
  bindings: NodeBinding[]
  probabilities: Probabilities
}

/** "LAD 81%" pinned to each vessel's on-surface `anchor` (never inside the heart). Toggleable. */
export function Labels({ bindings, probabilities }: Props) {
  const show = useViewState((s) => s.labels)
  const selected = useAppStore((s) => s.selectedTarget)
  if (!show) return null

  return (
    <>
      {bindings.map((b) => {
        if (b.target?.role !== 'vessel' || !b.anchor) return null
        const id = b.target.id
        return (
          <Html
            key={id}
            position={b.anchor}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span
              className={cn(
                'num whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur-sm',
                id === selected
                  ? 'border-white/70 bg-slate-950/80 text-white'
                  : 'border-white/20 bg-slate-950/60 text-slate-100',
              )}
            >
              {id} {pctLabel(probabilities[id])}
            </span>
          </Html>
        )
      })}
    </>
  )
}
