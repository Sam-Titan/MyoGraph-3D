import { TriangleAlert } from 'lucide-react'

/** Always visible on every tab. Not dismissible by design (CLAUDE.md hard rule 5). */
export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-notice-border bg-notice px-(--gutter) py-2 text-[0.8125rem] leading-snug text-notice-foreground"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p>
        <strong className="font-semibold">Decision support / educational only.</strong> Not a
        substitute for diagnostic imaging or clinical judgement.
      </p>
    </div>
  )
}
