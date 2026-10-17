import type { TargetInfo } from '@/api/client'
import { track } from '@/lib/analytics'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import type { Probabilities } from './useProbabilities'
import { focusTarget, useViewState } from './useViewState'

const GRADIENT = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${riskCss(i / 10)} ${i * 10}%`).join(', ')})`

/**
 * Probability legend plus every target's number, so the % is visible even with labels toggled off.
 * Colour is never shown without a number. Only the selected target's cut-off is
 * labelled; the others are faint ticks (id + value in the tooltip) so labels never collide.
 */
export function Legend({
  targets,
  probabilities,
  thresholds,
  compact = false,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  thresholds: Probabilities
  /** During a story the key rows give way to the story card (chips still show every number). */
  compact?: boolean
}) {
  const selected = useAppStore((s) => s.selectedTarget)
  const ticks = targets.flatMap((t) => {
    const threshold = thresholds[t.id]
    return threshold === undefined ? [] : [{ id: t.id, threshold }]
  })
  const active = ticks.find((t) => t.id === selected)
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/55 p-2.5 backdrop-blur-sm">
      <div>
        <div className="relative h-7">
          {active && (
            <span
              className="num absolute top-0 whitespace-nowrap rounded border border-white/25 bg-slate-950/90 px-1.5 py-0.5 text-xs leading-none text-viewport-foreground"
              // Slides from left-aligned (0%) to right-aligned (100%) so it never overflows the bar.
              style={{
                left: `${active.threshold * 100}%`,
                transform: `translateX(-${active.threshold * 100}%)`,
              }}
            >
              {active.id} cut-off {pct(active.threshold)}
            </span>
          )}
        </div>
        <div className="relative">
          <div className="h-2 rounded-full" style={{ backgroundImage: GRADIENT }} aria-hidden />
          {ticks.map((t) => {
            const isActive = t.id === selected
            return (
              <span
                key={t.id}
                role="img"
                aria-label={`${t.id} cut-off ${pct(t.threshold)}`}
                title={`${t.id} cut-off ${pct(t.threshold)}`}
                className={cn(
                  'absolute flex w-3 -translate-x-1/2 justify-center',
                  isActive ? '-top-[0.9rem] h-6' : '-top-1 h-4',
                )}
                style={{ left: `${t.threshold * 100}%` }}
              >
                <span
                  className={cn(
                    'h-full w-0.5 rounded-full',
                    isActive
                      ? 'bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]'
                      : 'bg-white/70 shadow-[0_0_0_1px_rgb(0_0_0/0.4)]',
                  )}
                />
              </span>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-viewport-muted">
          <span>0%</span>
          <span className="truncate">model estimate, tick marks the cut-off</span>
          <span>100%</span>
        </div>
      </div>
      <ul aria-label="Vessel key" hidden={compact} className="space-y-0.5">
        {targets.map((t) => {
          const p = probabilities[t.id]
          const vessel = t.role === 'vessel'
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={t.id === selected}
                onClick={() => {
                  focusTarget(t.id)
                  track('target_selected', { target: t.id, source: 'list' })
                }}
                onPointerEnter={() => useViewState.getState().setRowHover(t.id)}
                onPointerLeave={() => useViewState.getState().setRowHover(null)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-viewport-foreground outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-300',
                  t.id === selected && 'bg-white/15',
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full border border-white/30"
                  style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
                />
                <span className="w-9 shrink-0 font-medium">{t.id}</span>
                <span className="min-w-0 flex-1 truncate text-viewport-muted">
                  {vessel ? (t.where ?? t.plain_label) : t.plain_label}
                </span>
                <span className="num font-medium">{pct(p)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
