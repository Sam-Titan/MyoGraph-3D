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
      className={cn('relative flex min-h-0 min-w-0 flex-col xl:overflow-hidden', className)}
    >
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b bg-background px-4 pb-3 pt-2 max-md:pb-1.5 max-md:pt-1">
        <h2 className="t-section">{title}</h2>
        {aside}
      </header>
      <div
        ref={scroller}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 max-md:pt-3 xl:overflow-y-auto"
      >
        {children}
      </div>
      <ScrollCue target={scroller} />
    </section>
  )
}
