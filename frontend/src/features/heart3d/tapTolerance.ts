/** A finger is ~44 px wide: a tap that misses every mesh still counts for a vessel this close. */
export const TAP_TOLERANCE_PX = 24

/** World-space slack when comparing a sample point with the surface hit: points lying on that surface count as visible. */
export const OCCLUSION_EPS = 0.08

/** A projected sample point; `depth` is its distance from the camera. */
export interface ScreenPoint {
  x: number
  y: number
  depth: number
}

/** Consecutive visible sample points of one vessel mesh: the vessel is the line through them. */
export interface ScreenPolyline {
  id: string
  pts: readonly ScreenPoint[]
}

/** Distance from (px, py) to the segment a-b (a == b degrades to the point distance). */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** True unless the point lies behind the first surface hit along the tap ray (no hit: nothing hides it). */
export function visibleAt(
  depth: number,
  surfaceDepth: number | undefined,
  eps: number = OCCLUSION_EPS,
): boolean {
  return surfaceDepth === undefined || depth <= surfaceDepth + eps
}

/** Splits `pts` into runs of visible points; a hidden stretch ends a run, so no segment crosses it. */
export function visibleRuns(
  pts: readonly ScreenPoint[],
  surfaceDepth: number | undefined,
  eps: number = OCCLUSION_EPS,
): ScreenPoint[][] {
  const runs: ScreenPoint[][] = []
  let run: ScreenPoint[] = []
  for (const p of pts) {
    if (visibleAt(p.depth, surfaceDepth, eps)) {
      run.push(p)
    } else if (run.length > 0) {
      runs.push(run)
      run = []
    }
  }
  if (run.length > 0) runs.push(run)
  return runs
}

/**
 * Id of the polyline nearest to (x, y) within `maxPx`, or null. Distance is to the line segments
 * between consecutive points (a lone point counts as itself). Ties go to the earlier polyline.
 */
export function nearestWithin(
  lines: readonly ScreenPolyline[],
  x: number,
  y: number,
  maxPx: number = TAP_TOLERANCE_PX,
): string | null {
  let best: string | null = null
  let bestDist = maxPx
  for (const line of lines) {
    const { pts } = line
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[i + 1] ?? a
      const d = distToSegment(x, y, a.x, a.y, b.x, b.y)
      if (d <= bestDist && (best === null || d < bestDist)) {
        best = line.id
        bestDist = d
      }
    }
  }
  return best
}
