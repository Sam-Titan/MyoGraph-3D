import { ChevronDown } from 'lucide-react'
import { type RefObject, useEffect, useState } from 'react'

/** Bottom fade + "More below" chip while the scroller has content beneath the fold. */
export function ScrollCue({ target }: { target: RefObject<HTMLElement | null> }) {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = target.current
    if (!el) return
    const update = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const c of Array.from(el.children)) ro.observe(c)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [target])
  if (!more) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-14 items-end justify-center bg-gradient-to-t from-card via-card/80 to-transparent pb-1.5"
    >
      <span className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm">
        <ChevronDown className="size-3" /> More below
      </span>
    </div>
  )
}
