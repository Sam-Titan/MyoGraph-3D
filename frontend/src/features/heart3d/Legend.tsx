import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { TargetInfo } from '@/api/client'
import { safeStorage } from '@/features/layout/introPref'
import { track } from '@/lib/analytics'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { initialLegendHidden, writeLegendHidden } from './legendPref'
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
  note,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  thresholds: Probabilities
  /** During a story the key rows give way to the story card (chips still show every number). */
  compact?: boolean
  /** Below xl: replaces the legend's caption line (the supply-area sentence, kept off the chips). */
  note?: string
}) {
  const selected = useAppStore((s) => s.selectedTarget)
  const labels = useViewState((s) => s.labels)
  const [hidden, setHidden] = useState(initialLegendHidden)
  const toggle = () => {
    const next = !hidden
    setHidden(next)
    writeLegendHidden(safeStorage(), next)
    track('view_toggled', { control: 'legend' })
  }
  const ticks = targets.flatMap((t) => {
    const threshold = thresholds[t.id]
    return threshold === undefined ? [] : [{ id: t.id, threshold }]
  })
  const active = ticks.find((t) => t.id === selected)
  if (hidden) {
    return (
      <div
        data-legend="hidden"
        className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-slate-950/55 px-2.5 py-1 text-xs text-viewport-foreground backdrop-blur-sm max-md:px-2"
      >
        <span>Colour = estimated probability</span>
        {/* With labels off the key is the only place the numbers appear, so keep them (rule 8). */}
        {!labels && (
          <ul aria-label="Vessel estimates" className="flex gap-2">
            {targets.map((t) => {
              const p = probabilities[t.id]
              return (
                <li key={t.id} className="num flex items-center gap-1">
                  <span
                    aria-hidden
                    className="size-2 rounded-full border border-white/30"
                    style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
                  />
                  {t.id} {pct(p)}
                </li>
              )
            })}
          </ul>
        )}
        <LegendToggle hidden onClick={toggle} />
      </div>
    )
  }
  return (
    <div className="relative space-y-2 rounded-lg border border-white/10 bg-slate-950/55 p-2.5 backdrop-blur-sm max-md:space-y-1 max-md:p-2">
      <div className="absolute top-1 right-1 max-md:top-0.5 max-md:right-0.5">
        <LegendToggle hidden={false} onClick={toggle} />
      </div>
      <div>
        <div className="relative mr-9 h-7 max-md:h-6">
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
        <div
          className={cn(
            'mt-1 flex justify-between gap-2 text-xs text-viewport-muted',
            !note && 'max-md:hidden',
          )}
        >
          <span>0%</span>
          {note && <span className="truncate xl:hidden">{note}</span>}
          <span className={cn('truncate', note && 'max-xl:hidden')}>
            model estimate, tick marks the cut-off
          </span>
          <span>100%</span>
        </div>
      </div>
      <ul
        aria-label="Vessel key"
        hidden={compact}
        className="space-y-0.5 max-md:flex max-md:gap-1 max-md:space-y-0"
      >
        {targets.map((t) => {
          const p = probabilities[t.id]
          const vessel = t.role === 'vessel'
          return (
            <li key={t.id} className="max-md:min-w-0 max-md:flex-1">
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
                  'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left max-md:min-h-10 max-md:justify-center max-md:gap-1 text-xs text-viewport-foreground outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-300',
                  t.id === selected && 'bg-white/15',
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full border border-white/30"
                  style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
                />
                <span className="shrink-0 font-medium md:w-9">{t.id}</span>
                <span className="min-w-0 flex-1 truncate text-viewport-muted max-md:hidden">
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

function LegendToggle({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const Icon = hidden ? Eye : EyeOff
  const label = hidden ? 'Show legend' : 'Hide legend'
  return (
    <button
      type="button"
      aria-expanded={!hidden}
      aria-label={label}
      title={label}
      onClick={onClick}
      // The extra inset makes the touch target 44 px without growing the visible chip.
      className="relative flex size-7 items-center justify-center rounded text-viewport-muted outline-none before:absolute before:-inset-2 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300 max-md:size-6 [&_svg]:size-4"
    >
      <Icon />
    </button>
  )
}
