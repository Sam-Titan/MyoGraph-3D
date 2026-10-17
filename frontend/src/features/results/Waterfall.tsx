import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DisplayConfig } from '@/api/client'
import { GlossaryText } from '@/components/GlossaryText'
import { pct } from '@/lib/format'
import { fillText } from '@/lib/template'
import { cn } from '@/lib/utils'
import { at, axisFor, signOf, stepPoints, type WaterfallStep } from './waterfallModel'

interface Props {
  steps: WaterfallStep[]
  probability: number
  threshold: number
  range: { lo: number; hi: number } | undefined
  display: DisplayConfig
  /** Feature ids a story step points at. */
  marked: ReadonlySet<string>
}

const TRACK = 'relative block h-5 min-w-0 flex-1'

/**
 * Horizontal probability waterfall: baseline -> one bar per factor -> estimate. Direction is shown
 * with an arrow and a signed number, never by colour alone; the cut-off is a dashed line.
 */
export function Waterfall({ steps, probability, threshold, range, display, marked }: Props) {
  const axis = axisFor(steps, range, threshold)
  const base = steps[0]?.from_p ?? probability
  const w = display.waterfall
  const cut = at(axis, threshold)
  return (
    <div data-testid="waterfall" className="space-y-1">
      <div
        aria-hidden
        className="grid grid-cols-1 gap-x-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <span className="hidden sm:block" />
        <span className="flex items-center gap-1.5">
          <span className="relative block h-4 min-w-0 flex-1">
            <span
              className="num absolute -translate-x-1/2 whitespace-nowrap text-foreground/70"
              style={{ left: `${Math.min(Math.max(cut, 20), 80)}%` }}
            >
              {fillText(w.cutoff_tick, { thr: pct(threshold) })}
            </span>
          </span>
          <span className="w-24 shrink-0" />
        </span>
      </div>
      <ul className="divide-y">
        <Row cut={cut} label={w.start_label} value={pct(base)}>
          <Marker left={at(axis, base)} />
        </Row>
        {steps.map((s) => {
          const points = stepPoints(s)
          const lo = Math.min(s.from_p, s.to_p)
          const width = Math.max(Math.abs(at(axis, s.to_p) - at(axis, s.from_p)), 0.8)
          const up = s.to_p >= s.from_p
          const text = fillText(w.points, { sign: signOf(points), n: Math.abs(points) })
          return (
            <Row
              cut={cut}
              key={s.feature ?? '__other__'}
              label={s.value_display ? `${s.label}: ${s.value_display}` : s.label}
              value={text}
              icon={
                up ? (
                  <ArrowUp className="size-3" aria-hidden />
                ) : (
                  <ArrowDown className="size-3" aria-hidden />
                )
              }
              highlight={s.feature !== null && marked.has(s.feature)}
              muted={s.feature === null}
            >
              <span
                className={cn(
                  'absolute inset-y-1 rounded-sm',
                  up ? 'bg-contrib-up' : 'bg-contrib-down',
                  s.feature === null && 'opacity-55',
                )}
                style={{ left: `${at(axis, lo)}%`, width: `${width}%` }}
              />
            </Row>
          )
        })}
        <Row cut={cut} label={w.end_label} value={pct(probability)} strong>
          {range && (
            <span
              aria-hidden
              className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-foreground/35"
              style={{
                left: `${at(axis, range.lo)}%`,
                width: `${at(axis, range.hi) - at(axis, range.lo)}%`,
              }}
            />
          )}
          <Marker left={at(axis, probability)} strong />
        </Row>
      </ul>
      <div
        aria-hidden
        className="grid grid-cols-1 gap-x-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <span className="hidden sm:block" />
        <span className="flex items-center gap-1.5">
          <span className="num flex min-w-0 flex-1 justify-between">
            <span>{pct(axis.min)}</span>
            <span>{pct(axis.max)}</span>
          </span>
          <span className="w-24 shrink-0" />
        </span>
      </div>
    </div>
  )
}

function Marker({ left, strong = false }: { left: number; strong?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-background bg-foreground',
        strong ? 'size-3.5' : 'opacity-70',
      )}
      style={{ left: `${left}%` }}
    />
  )
}

interface RowProps {
  /** Cut-off position on the track, in %. */
  cut: number
  label: string
  value: string
  icon?: ReactNode
  highlight?: boolean
  muted?: boolean
  strong?: boolean
  children: ReactNode
}

function Row({ cut, label, value, icon, highlight, muted, strong, children }: RowProps) {
  return (
    <li
      data-highlight={highlight || undefined}
      className="grid grid-cols-1 items-center gap-x-3 gap-y-0.5 py-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] data-[highlight]:rounded data-[highlight]:bg-primary/10 data-[highlight]:ring-2 data-[highlight]:ring-primary/50"
    >
      <span
        className={cn(
          'min-w-0 break-words text-xs leading-snug',
          muted && 'text-muted-foreground',
          strong && 'font-semibold',
        )}
      >
        <GlossaryText text={label} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={TRACK}>
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
          <span
            aria-hidden
            className="absolute inset-y-0 border-l border-dashed border-foreground/40"
            style={{ left: `${cut}%` }}
          />
          {children}
        </span>
        <span
          className={cn(
            'num flex w-24 shrink-0 items-center justify-end gap-0.5 whitespace-nowrap text-xs',
            strong && 'font-semibold',
          )}
        >
          {icon}
          {value}
        </span>
      </span>
    </li>
  )
}
