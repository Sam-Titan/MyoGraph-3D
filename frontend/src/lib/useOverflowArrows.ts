import { type CSSProperties, type RefObject, useCallback, useEffect, useState } from 'react'

const EDGE_PX = 2

export type OverflowState = { overflowing: boolean; canPrev: boolean; canNext: boolean }

/** Tracks whether a horizontally scrolling element overflows and which ends still have content. */
export function useOverflowArrows(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<OverflowState>({
    overflowing: false,
    canPrev: false,
    canNext: false,
  })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const overflowing = el.scrollWidth - el.clientWidth > EDGE_PX
    const canPrev = overflowing && el.scrollLeft > EDGE_PX
    const canNext = overflowing && el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_PX
    setState((s) =>
      s.overflowing === overflowing && s.canPrev === canPrev && s.canNext === canNext
        ? s
        : { overflowing, canPrev, canNext },
    )
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    const observeChildren = () => {
      ro.disconnect()
      ro.observe(el)
      for (const child of Array.from(el.children)) ro.observe(child)
      measure()
    }
    observeChildren()
    // Items that mount later (e.g. toggles read from the GLB) change scrollWidth, not the scroller's box.
    const mo = new MutationObserver(observeChildren)
    mo.observe(el, { childList: true })
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref, measure])

  const scrollByPage = useCallback(
    (dir: -1 | 1) => {
      const el = ref.current
      if (!el) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' })
    },
    [ref],
  )

  return { ...state, scrollByPage }
}

/** Fades only the edge that still has hidden content, so the first/last item (and its focus ring) stays unmasked. */
export function fadeMask(canPrev: boolean, canNext: boolean): CSSProperties | undefined {
  if (!canPrev && !canNext) return undefined
  const left = canPrev ? 'transparent 0, #000 20px' : '#000 0, #000 0'
  const right = canNext ? '#000 calc(100% - 20px), transparent 100%' : '#000 100%, #000 100%'
  const image = `linear-gradient(to right, ${left}, ${right})`
  return { maskImage: image, WebkitMaskImage: image }
}
