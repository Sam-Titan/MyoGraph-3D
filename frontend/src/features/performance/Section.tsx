import type { ReactNode } from 'react'

interface Props {
  title: string
  caption: string
  aside?: ReactNode
  children: ReactNode
}

/** Titled block with a one-line plain-language caption. */
export function Section({ title, caption, aside, children }: Props) {
  return (
    <section aria-label={title} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="label-caps">{title}</h3>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}
