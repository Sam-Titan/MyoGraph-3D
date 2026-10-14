import { type ReactNode, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ScrollCue } from './ScrollCue'

interface Props {
  title: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}

/** Titled, independently scrolling workspace column. */
export function Panel({ title, aside, className, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  return (
    <section
      aria-label={title}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card',
        className,
      )}
    >
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
        <h2 className="label-caps">{title}</h2>
        {aside}
      </header>
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        {children}
      </div>
      <ScrollCue target={scroller} />
    </section>
  )
}
