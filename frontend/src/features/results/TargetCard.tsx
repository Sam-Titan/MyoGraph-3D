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

/**
 * One full-width row per target: line 1 id · label + swatch and %, line 2 verdict · threshold,
 * line 3 (unedited preset only) the actual finding and whether the estimate agrees.
 */
export function TargetCard({ target, prediction, actual, selected, prominent, onSelect }: Props) {
  const agrees = actual !== undefined && prediction ? actual === prediction.positive : undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="block w-full min-w-0 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-sm">
          <span className="num font-semibold">{target.id}</span>
          <span aria-hidden className="text-muted-foreground">
            {' · '}
          </span>
          <span className="text-muted-foreground">{target.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-black/10"
            style={{ background: prediction ? riskCss(prediction.probability) : 'transparent' }}
          />
          <TweenedPercent
            value={prediction?.probability}
            className={cn('num font-semibold', prominent ? 'text-2xl' : 'text-lg')}
          />
        </span>
      </span>
      {prediction && (
        <span className="mt-0.5 block text-xs">
          <span className="font-medium">{prediction.positive ? 'Likely' : 'Unlikely'}</span>
          <span className="num text-muted-foreground">
            {' '}
            · threshold {pct(prediction.threshold)}
          </span>
        </span>
      )}
      {actual !== undefined && (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span>
            <abbr title="catheterisation finding" className="text-muted-foreground no-underline">
              Actual (cath):
            </abbr>{' '}
            <span className="font-medium">{actual ? 'Stenotic' : 'Normal'}</span>
          </span>
          {agrees !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                !agrees && 'text-destructive',
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
