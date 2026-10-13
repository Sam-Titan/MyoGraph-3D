import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}

/** Titled, independently scrolling workspace column. */
export function Panel({ title, aside, className, children }: Props) {
  return (
    <section
      aria-label={title}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card', className)}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="label-caps">{title}</h2>
        {aside}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  )
}
