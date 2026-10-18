/** A finger is ~44 px wide: a tap that misses every mesh still counts for a vessel this close. */
export const TAP_TOLERANCE_PX = 24

export interface ScreenPoint {
  id: string
  x: number
  y: number
}

/** Id of the point nearest to (x, y) within `maxPx`, or null. Ties go to the earlier point. */
export function nearestWithin(
  points: readonly ScreenPoint[],
  x: number,
  y: number,
  maxPx: number = TAP_TOLERANCE_PX,
): string | null {
  let best: string | null = null
  let bestDist = maxPx
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= bestDist) {
      if (best === null || d < bestDist) {
        best = p.id
        bestDist = d
      }
    }
  }
  return best
}
