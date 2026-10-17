import type { TargetInfo } from '@/api/client'
import { track } from '@/lib/analytics'
import { pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { getEls, type LabelRegistry } from './labelRegistry'
import type { Probabilities } from './useProbabilities'
import { focusTarget, useViewState } from './useViewState'

/**
 * One name chip per vessel ("LAD · 81%") with a thin leader line to its anchor on the artery. Plain
 * DOM like HoverTooltip (no drei <Html>): LabelSync writes the positions straight to these nodes
 * every frame, so camera moves cause no React re-render. Click / tap / Enter selects the vessel.
 */
export function LabelChips({
  targets,
  probabilities,
  registry,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  registry: LabelRegistry
}) {
  const show = useViewState((s) => s.labels)
  const selected = useAppStore((s) => s.selectedTarget)
  if (!show) return null
  const vessels = targets.filter((t) => t.role === 'vessel')
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <svg className="absolute inset-0 size-full" aria-hidden>
        {vessels.map((t) => {
          const on = t.id === selected
          return (
            <g key={t.id} className={on ? 'text-white' : 'text-white/70'}>
              <line
                ref={(el) => {
                  getEls(registry, t.id).line = el
                }}
                stroke="currentColor"
                strokeWidth={on ? 1.75 : 1}
                visibility="hidden"
              />
              <circle
                ref={(el) => {
                  getEls(registry, t.id).dot = el
                }}
                r={on ? 3.5 : 2.5}
                stroke="currentColor"
                strokeWidth={1.25}
                visibility="hidden"
              />
            </g>
          )
        })}
      </svg>
      {vessels.map((t) => {
        const p = probabilities[t.id]
        return (
          <button
            key={t.id}
            type="button"
            data-target-chip={t.id}
            aria-pressed={t.id === selected}
            aria-label={`${t.label}, model estimate ${pct(p)}`}
            title={t.plain_label}
            ref={(el) => {
              getEls(registry, t.id).chip = el
            }}
            onClick={() => {
              focusTarget(t.id)
              track('target_selected', { target: t.id, source: '3d' })
            }}
            className={cn(
              'num pointer-events-auto invisible absolute top-0 left-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300 data-[hidden=true]:border-dashed data-[hidden=true]:bg-slate-950/90 sm:px-2 sm:text-sm',
              t.id === selected
                ? 'border-white/80 bg-slate-950/85 text-white'
                : 'border-white/30 bg-slate-950/65 text-slate-100',
            )}
          >
            {t.id}
            <span className="hidden sm:inline"> ·</span> {pct(p)}
          </button>
        )
      })}
    </div>
  )
}
