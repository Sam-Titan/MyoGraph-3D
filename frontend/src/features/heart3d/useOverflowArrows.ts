import { type RefObject, useCallback, useEffect, useState } from 'react'

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
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
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
