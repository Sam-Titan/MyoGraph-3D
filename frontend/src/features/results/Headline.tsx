import type { TargetInfo, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import type { components } from '@/api/schema'
import { useViewState } from '@/features/heart3d/useViewState'
import { pctRange } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { TweenedPercent } from './TweenedPercent'
import { labelSentence } from './verdict'

type Prediction = components['schemas']['TargetPrediction']

interface Props {
  target: TargetInfo
  prediction: Prediction | undefined
  range: TargetRange | undefined
  selected: boolean
  onSelect: () => void
}

/** The overall estimate as one plain sentence; a button so its WHY can be opened like a vessel's. */
export function Headline({ target, prediction, range, selected, onSelect }: Props) {
  const setRowHover = useViewState((s) => s.setRowHover)
  const { data: display } = useDisplay()
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
        <span className="min-w-0 text-[1.375rem] font-semibold leading-snug">
          <TweenedPercent value={prediction?.probability} className="num" />
          {range && (
            <span className="num ml-1 text-[1rem] font-medium text-muted-foreground">
              ({pctRange(range.interval.lo, range.interval.hi)})
            </span>
          )}{' '}
          probability of {target.plain_label}
        </span>
      </span>
      {prediction && range && (
        <span className="t-meta mt-1 block pl-[1.375rem]">
          {labelSentence(range, prediction.threshold, display)}
        </span>
      )}
    </button>
  )
}
