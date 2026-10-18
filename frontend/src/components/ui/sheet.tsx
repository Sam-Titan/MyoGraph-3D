import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const Sheet = DialogPrimitive.Root

/** Bottom sheet on the Base UI dialog: close button, Esc and backdrop tap dismiss it (no drag). */
function SheetContent({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className="fixed inset-0 z-60 bg-black/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-60 flex max-h-[88dvh] flex-col rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-xl outline-hidden transition-transform duration-200 data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:transition-none',
          className,
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <DialogPrimitive.Title className="t-section">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label={`Close ${title.toLowerCase()}`}
            className="grid size-11 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-5" />
          </DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetContent }
