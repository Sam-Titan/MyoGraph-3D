import type { TargetInfo, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import type { components } from '@/api/schema'
import { useViewState } from '@/features/heart3d/useViewState'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { HeadlineSentence } from './HeadlineSentence'
import { PinDelta } from './PinDelta'
import type { Delta } from './pinModel'
import { labelSentence } from './verdict'

type Prediction = components['schemas']['TargetPrediction']

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
        <span className="min-w-0 text-[1.25rem] font-semibold leading-snug">
          <HeadlineSentence
            target={target}
            probability={prediction?.probability}
            range={range?.interval}
            tween
            glossary={false}
          />
        </span>
      </span>
      <PinDelta delta={delta} prefix="Since pinned: " className="mt-1 pl-[1.375rem]" />
      {prediction && range && (
        <span className="t-meta mt-1 block pl-[1.375rem]">
          {labelSentence(range, prediction.threshold, display)}
        </span>
      )}
    </button>
  )
}
