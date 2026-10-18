/** Headline + three table rows at their final heights, so the first screen does not jump when the numbers arrive. */
export function ResultsSkeleton() {
  return (
    <div role="status" aria-busy className="space-y-4" data-testid="results-skeleton">
      <div className="space-y-2 px-3 py-2">
        <div className="h-6 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <span className="sr-only">Waiting for the first estimate…</span>
    </div>
  )
}
