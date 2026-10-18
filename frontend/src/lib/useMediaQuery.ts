import { useSyncExternalStore } from 'react'

/** Live `matchMedia` match (false on the server / without matchMedia). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Matches Tailwind's `xl`: the three-column workspace with the inline patient form. */
export const WIDE_QUERY = '(min-width: 1280px)'
