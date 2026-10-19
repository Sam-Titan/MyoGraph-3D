import { type RefObject, useEffect } from 'react'

/**
 * Phones: the sticky heart card would eat two thirds of a scrolling screen, so it sticks with a
 * negative `top` that leaves only the legend strip (colour key + every target's number) pinned. The
 * card keeps its full height in the flow, so nothing shifts while scrolling. Sets `--stick-top` on
 * the card; with no strip (or `enabled` false) it is removed and the card sticks whole.
 */
export function usePinnedStrip(wrap: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const resizes = new ResizeObserver(() => apply())
    let observed: Element | null = null
    function apply() {
      const strip = enabled ? el?.querySelector('[data-pinned-strip]') : null
      if (!el) return
      if (!strip) {
        el.style.removeProperty('--stick-top')
        return
      }
      if (strip !== observed) {
        if (observed) resizes.unobserve(observed)
        resizes.observe(strip)
        observed = strip
      }
      const box = el.getBoundingClientRect()
      const stripHeight = box.bottom - strip.getBoundingClientRect().top
      el.style.setProperty('--stick-top', `${Math.min(0, stripHeight - box.height)}px`)
    }
    // The heart mounts lazily, so watch for the strip appearing as well as for size changes.
    const mutations = new MutationObserver(apply)
    mutations.observe(el, { childList: true, subtree: true })
    resizes.observe(el)
    apply()
    return () => {
      mutations.disconnect()
      resizes.disconnect()
      el.style.removeProperty('--stick-top')
    }
  }, [wrap, enabled])
}
