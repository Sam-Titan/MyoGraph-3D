import type { TargetInfo, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import type { components } from '@/api/schema'
import { useViewState } from '@/features/heart3d/useViewState'
import { pctRange } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { fillText } from '@/lib/template'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { HeadlineSentence } from './HeadlineSentence'
import { PinDelta } from './PinDelta'
import type { Delta } from './pinModel'
import { TweenedPercent } from './TweenedPercent'
import { labelSentence, thresholdLabel } from './verdict'

type Prediction = components['schemas']['TargetPrediction']

/** Tailwind `md`: below it the headline is the compact number block, not the full sentence. */
const MD_QUERY = '(min-width: 768px)'

interface Props {
  target: TargetInfo
  prediction: Prediction | undefined
  range: TargetRange | undefined
  delta?: Delta
  selected: boolean
  onSelect: () => void
}

/** The overall estimate as one plain sentence; a button so its WHY can be opened like a vessel's. */
export function Headline({ target, prediction, range, delta, selected, onSelect }: Props) {
  const setRowHover = useViewState((s) => s.setRowHover)
  const { data: display } = useDisplay()
  const roomy = useMediaQuery(MD_QUERY)
  const interval = range?.interval
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      onPointerEnter={() => setRowHover(target.id)}
      onPointerLeave={() => setRowHover(null)}
      onFocus={() => setRowHover(target.id)}
      onBlur={() => setRowHover(null)}
      className={cn(
        'block w-full min-w-0 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted',
        'aria-pressed:bg-accent aria-pressed:shadow-[inset_2px_0_0_var(--primary)]',
      )}
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-2 size-2.5 shrink-0 rounded-full border border-black/10"
          style={{ background: prediction ? riskCss(prediction.probability) : 'transparent' }}
        />
        {roomy || !display ? (
          <span className="min-h-[2lh] min-w-0 text-[1.0625rem] font-semibold leading-snug sm:text-[1.25rem]">
            <HeadlineSentence
              target={target}
              probability={prediction?.probability}
              range={interval}
              tween
              glossary={false}
            />
          </span>
        ) : (
          // Phones: the number first and big, label and range on one line, so the table stays on screen.
          <span className="min-w-0">
            <TweenedPercent
              value={prediction?.probability}
              className="num block min-h-[1lh] text-[2.5rem] font-bold leading-none"
            />
            <span className="mt-1.5 block min-h-[1lh] text-[0.8125rem] leading-snug text-muted-foreground">
              {fillText(display.headline_compact, { label: target.label })}
              {interval &&
                ` · ${fillText(display.headline_range_compact, { range: pctRange(interval.lo, interval.hi) })}`}
            </span>
          </span>
        )}
      </span>
      <PinDelta delta={delta} prefix="Since pinned: " className="mt-1 pl-[1.375rem]" />
      <span className="t-meta mt-1 block min-h-[1lh] pl-[1.375rem] md:min-h-[2lh]">
        {prediction &&
          range &&
          // Phones keep to the label; the cut-off value is on the 3D scale and in the why panel.
          (roomy
            ? labelSentence(range, prediction.threshold, display)
            : thresholdLabel(range, display))}
      </span>
    </button>
  )
}
