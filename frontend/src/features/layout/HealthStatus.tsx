import { useHealth } from '@/api/queries'

export function HealthStatus() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'checking' : isError ? 'unreachable' : 'ok'
  const dot = {
    checking: 'bg-muted-foreground/40',
    unreachable: 'bg-destructive',
    ok: 'bg-primary',
  }[state]

  return (
    <p
      className="flex min-w-0 max-w-full items-center gap-2 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {state === 'checking' && 'API: checking…'}
      {state === 'unreachable' && 'API: unreachable'}
      {state === 'ok' && (
        <span className="flex min-w-0 gap-1">
          <span className="shrink-0">API ok · model</span>
          <span className="num min-w-0 truncate" title={data?.model_version}>
            {data?.model_version}
          </span>
        </span>
      )}
    </p>
  )
}
