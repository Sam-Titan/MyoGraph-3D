import { type RefObject, useCallback, useEffect, useRef } from 'react'

/** A press that travels this far (px) is a drag (orbit/pan), never a click. */
export const CLICK_MAX_TRAVEL_PX = 5

/**
 * Tracks pointer travel between pointerdown and pointerup on `ref`. Returns `isClick()`, which is
 * false when the last gesture travelled >= 5 px at any point (out-and-back counts). Rotating the
 * heart by dragging must never change the selection or move the camera, so every click handler
 * (vessel, heart, empty space) asks this first.
 */
export function useClickGuard(ref: RefObject<HTMLElement | null>): () => boolean {
  const dragged = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let origin: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (origin) return // second finger of a pinch: keep the first pointer's origin
      origin = { x: e.clientX, y: e.clientY }
      dragged.current = false
    }
    const move = (e: PointerEvent) => {
      if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >= CLICK_MAX_TRAVEL_PX) {
        dragged.current = true
      }
    }
    const end = () => {
      origin = null
    }
    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [ref])

  return useCallback(() => !dragged.current, [])
}
