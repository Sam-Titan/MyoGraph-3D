import { useHealth } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { restartWake, WAKE_TEXT } from '@/lib/wake'
import { useServerWake } from './useServerWake'

/** Header status of the prediction server. Quiet when ready; the model version is a tooltip, not text. */
export function HealthStatus() {
  const { data, refetch } = useHealth()
  const phase = useServerWake()
  const dot = {
    connecting: 'bg-muted-foreground/40',
    waking: 'bg-muted-foreground/40 animate-pulse',
    slow: 'bg-muted-foreground/40 animate-pulse',
    failed: 'bg-destructive',
    ready: 'bg-primary',
  }[phase]

  return (
    <p
      className="flex min-w-0 max-w-full items-center gap-2 text-xs text-muted-foreground"
      aria-live="polite"
      title={data ? `Model ${data.model_version}` : undefined}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {phase === 'connecting' && <span className="max-sm:sr-only">Connecting…</span>}
      {(phase === 'waking' || phase === 'slow') && (
        <span className="max-sm:sr-only">{WAKE_TEXT[phase]}</span>
      )}
      {phase === 'ready' && <span className="sr-only">Prediction server ready</span>}
      {phase === 'failed' && (
        <>
          <span className="max-sm:sr-only">Couldn’t reach the prediction server.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              restartWake()
              void refetch()
            }}
          >
            Try again
          </Button>
        </>
      )}
    </p>
  )
}
