import { Check, X } from 'lucide-react'
import type { TargetInfo } from '@/api/client'
import type { components } from '@/api/schema'
import { pct } from '@/lib/format'
import { riskCss } from '@/lib/riskColor'
import { cn } from '@/lib/utils'
import { TweenedPercent } from './TweenedPercent'

type Prediction = components['schemas']['TargetPrediction']

interface Props {
  target: TargetInfo
  prediction: Prediction | undefined
  /** Actual catheterisation finding (loaded, unedited preset), if known. */
  actual: boolean | undefined
  selected: boolean
  prominent?: boolean
  onSelect: () => void
}

/** One target: model estimate, tuned-threshold verdict and (for presets) the actual finding. */
export function TargetCard({ target, prediction, actual, selected, prominent, onSelect }: Props) {
  const likely = prediction?.positive
  const agrees = actual !== undefined && prediction ? actual === prediction.positive : undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent',
        prominent && 'py-3',
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="label-caps block">{target.id}</span>
          <span className="block truncate text-sm">{target.label}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-black/10"
            style={{ background: prediction ? riskCss(prediction.probability) : 'transparent' }}
          />
          <TweenedPercent
            value={prediction?.probability}
            className={cn('num font-semibold', prominent ? 'text-3xl' : 'text-xl')}
          />
        </span>
      </span>
      {prediction && (
        <span className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{likely ? 'Likely' : 'Unlikely'}</span>
          <span className="num text-muted-foreground">threshold {pct(prediction.threshold)}</span>
        </span>
      )}
      {actual !== undefined && (
        <span className="mt-1.5 flex items-center justify-between gap-2 border-t pt-1.5 text-xs">
          <span className="text-muted-foreground">
            Actual (catheterisation):{' '}
            <span className="font-medium text-foreground">{actual ? 'Stenotic' : 'Normal'}</span>
          </span>
          {agrees !== undefined && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 font-medium',
                agrees ? 'text-foreground' : 'text-destructive',
              )}
            >
              {agrees ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              {agrees ? 'agrees' : 'misses'}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
