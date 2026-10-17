import type { DisplayConfig, TargetInfo } from '@/api/client'
import { GlossaryText } from '@/components/GlossaryText'
import { pct, pctRange } from '@/lib/format'
import { fillTemplate } from '@/lib/template'
import { cn } from '@/lib/utils'
import { dotStates } from './waterfallModel'

interface Props {
  target: TargetInfo
  probability: number
  range: { lo: number; hi: number }
  display: DisplayConfig
}

const DOT = {
  solid: 'bg-foreground',
  light: 'bg-foreground/30',
  empty: 'border border-foreground/25',
} as const

/**
 * 100 patients as dots: solid up to the start of the range, lighter across the range, a ring on the
 * estimate. The number is always printed beside it, so the picture never carries the value alone.
 */
export function DotPicture({ target, probability, range, display }: Props) {
  const { states, ring } = dotStates(probability, range)
  const d = display.dots
  return (
    <figure
      data-testid="dot-picture"
      className="space-y-1.5"
      aria-label={`${pct(probability)}, range ${pctRange(range.lo, range.hi)}`}
    >
      <div
        aria-hidden
        className="grid w-fit grid-cols-[repeat(20,0.5rem)] gap-1 sm:grid-cols-[repeat(25,0.5rem)]"
      >
        {states.map((state, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 100 positions
            key={i}
            className={cn(
              'size-2 rounded-full',
              DOT[state],
              i === ring && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
          />
        ))}
      </div>
      <figcaption className="text-xs">
        {fillTemplate(d.caption, {
          p: <span className="num font-semibold">{pct(probability)}</span>,
          outcome: <GlossaryText text={target.outcome_phrase} />,
        })}
        <span className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
          <Legend className="bg-foreground" text={d.legend_solid} />
          <Legend className="bg-foreground/30" text={d.legend_light} />
          <Legend className="ring-2 ring-primary" text={d.legend_ring} />
        </span>
      </figcaption>
    </figure>
  )
}

function Legend({ className, text }: { className: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('size-2 rounded-full', className)} />
      {text}
    </span>
  )
}
