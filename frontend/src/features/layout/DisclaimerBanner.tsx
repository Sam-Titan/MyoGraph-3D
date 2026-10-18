import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DISCLAIMER_BODY, DISCLAIMER_LEAD } from './disclaimer'

/**
 * Always visible on every tab. Not dismissible by design (CLAUDE.md hard rule 5). On phones it is
 * one line with a "More" toggle that expands the full wording in place; it only grows, never goes.
 */
export function DisclaimerBanner() {
  const [open, setOpen] = useState(false)
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-notice-border bg-notice pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(var(--gutter),env(safe-area-inset-right))] pb-2 pl-[max(var(--gutter),env(safe-area-inset-left))] text-[0.8125rem] leading-snug text-notice-foreground"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className={cn('min-w-0 flex-1', !open && 'max-sm:truncate')}>
        <strong className="font-semibold">{DISCLAIMER_LEAD}</strong>
        <span className={cn(!open && 'max-sm:hidden')}> {DISCLAIMER_BODY}</span>
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-my-2 shrink-0 px-2 py-2.5 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
      >
        {open ? 'Less' : 'More'}
      </button>
    </div>
  )
}
