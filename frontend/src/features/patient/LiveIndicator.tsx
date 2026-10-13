import { cn } from '@/lib/utils'
import type { LiveState } from './useLivePredict'

const COPY: Record<LiveState, string> = {
  live: 'Live',
  busy: 'Updating…',
  paused: 'Paused — fix highlighted fields',
  error: 'Prediction failed',
}

export function LiveIndicator({ state }: { state: LiveState }) {
  return (
    <output className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          state === 'live' && 'bg-risk-low',
          state === 'busy' && 'bg-risk-mid motion-safe:animate-pulse',
          state === 'paused' && 'bg-muted-foreground/50',
          state === 'error' && 'bg-destructive',
        )}
      />
      {COPY[state]}
    </output>
  )
}
