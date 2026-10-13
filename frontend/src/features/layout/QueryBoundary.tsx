import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props<T> {
  query: UseQueryResult<T>
  what: string
  children: (data: T) => ReactNode
}

/** Shared loading / error states so every panel degrades the same way. */
export function QueryBoundary<T>({ query, what, children }: Props<T>) {
  if (query.isPending) {
    return (
      <div aria-busy className="space-y-2" role="status">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <span className="sr-only">Loading {what}…</span>
      </div>
    )
  }
  if (query.isError) {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p className="text-destructive">Couldn’t load {what}.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  return <>{children(query.data)}</>
}
