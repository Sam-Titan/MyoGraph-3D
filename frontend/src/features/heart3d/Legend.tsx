import type { TargetInfo } from '@/api/client'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import type { Probabilities } from './useProbabilities'

const GRADIENT = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${riskCss(i / 10)} ${i * 10}%`).join(', ')})`

/**
 * Probability legend plus every target's number, so the % is visible even with labels toggled off.
 * Colour is never shown without a number. Only the selected target's decision threshold is
 * labelled; the others are faint ticks (id + value in the tooltip) so labels never collide.
 */
export function Legend({
  targets,
  probabilities,
  thresholds,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
  thresholds: Probabilities
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
              {active.id} threshold {pct(active.threshold)}
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
                aria-label={`${t.id} decision threshold ${pct(t.threshold)}`}
                title={`${t.id} decision threshold ${pct(t.threshold)}`}
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
          <span className="truncate">model estimate, tick marks the threshold</span>
          <span>100%</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {targets.map((t) => {
          const p = probabilities[t.id]
          return (
            <li key={t.id} className="flex items-center gap-1.5 text-xs text-viewport-foreground">
              <span
                aria-hidden
                className="size-2 rounded-full border border-white/30"
                style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
              />
              <span className="text-viewport-muted">{t.id}</span>
              <span className="num font-medium">{pct(p)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
