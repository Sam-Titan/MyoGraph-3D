import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Raycaster, Vector3 } from 'three'
import { pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import type { NodeBinding } from './useHeartModel'
import type { Probabilities } from './useProbabilities'
import { useViewState } from './useViewState'

interface Props {
  bindings: NodeBinding[]
  probabilities: Probabilities
}

const GAP_PX = 2
const MAX_NUDGES = 4
/** A label moved off its anchor sits this far (px) clear of the heart's projected bbox. */
const SILHOUETTE_GAP_PX = 12
/** A ray hit this much nearer than the anchor (scene units, heart ~2 tall) means "behind the heart". */
const OCCLUSION_EPS = 0.03
/** Re-test occlusion at most this often during camera animation (heart raycast is not free). */
const OCCLUSION_INTERVAL_MS = 100
const HIDDEN_TITLE = 'behind the heart from this angle (try X-ray or select it to rotate)'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w + GAP_PX &&
  b.x < a.x + a.w + GAP_PX &&
  a.y < b.y + b.h + GAP_PX &&
  b.y < a.y + a.h + GAP_PX

/**
 * "LAD 81%" pinned to each vessel's on-surface `anchor`. Toggleable. Per frame:
 * - a label whose anchor is behind the heart from the current camera (and X-ray is off) is moved
 *   horizontally, at the anchor's screen y, to just outside the heart's projected bbox on the
 *   anchor's side, and drawn dashed; it returns to its anchor once the vessel is visible again;
 * - overlapping labels are nudged down by their own height, in API target order (moved labels
 *   last), so labels never sit on each other;
 * - a label whose final box is not fully inside the viewport is hidden (opacity 0, no pointer
 *   events: the wrapper is already pointer-events none), never clamped.
 */
export function Labels({ bindings, probabilities }: Props) {
  const show = useViewState((s) => s.labels)
  const xray = useViewState((s) => s.xray)
  const selected = useAppStore((s) => s.selectedTarget)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const els = useRef(new Map<string, HTMLSpanElement>())
  const scratch = useRef(new Vector3())
  const raycaster = useRef(new Raycaster())
  const occluded = useRef(new Map<string, boolean>())
  const lastTest = useRef(Number.NEGATIVE_INFINITY)
  const retest = useRef<number | null>(null)

  const heart = bindings.find((b) => b.target?.role === 'overall') ?? null

  useFrame(() => {
    if (!show) return
    const labelled = bindings.filter((b) => b.target?.role === 'vessel' && b.anchor)

    // Occlusion by the heart (throttled; a trailing re-test runs when the camera settles).
    const now = performance.now()
    if (now - lastTest.current >= OCCLUSION_INTERVAL_MS) {
      lastTest.current = now
      for (const b of labelled) {
        if (!b.target || !b.anchor) continue
        let hidden = false
        if (heart && !xray) {
          const dir = scratch.current.copy(b.anchor).sub(camera.position)
          const dist = dir.length()
          raycaster.current.set(camera.position, dir.normalize())
          raycaster.current.far = dist
          const hit = raycaster.current.intersectObjects(heart.meshes, false)[0]
          hidden = hit !== undefined && hit.distance < dist - OCCLUSION_EPS
        }
        occluded.current.set(b.target.id, hidden)
      }
    } else if (retest.current === null) {
      retest.current = window.setTimeout(() => {
        retest.current = null
        invalidate()
      }, OCCLUSION_INTERVAL_MS)
    }

    // Heart's projected bbox (corner projection is conservative for a convex-ish organ).
    let heartX: [number, number] | null = null
    if (heart) {
      const bb = new Box3().setFromObject(heart.object)
      let lo = Number.POSITIVE_INFINITY
      let hi = Number.NEGATIVE_INFINITY
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y])
          for (const z of [bb.min.z, bb.max.z]) {
            const px = ((scratch.current.set(x, y, z).project(camera).x + 1) / 2) * size.width
            lo = Math.min(lo, px)
            hi = Math.max(hi, px)
          }
      heartX = [lo, hi]
    }

    const placed: Box[] = []
    const order = [
      ...labelled.filter((b) => !occluded.current.get(b.target?.id ?? '')),
      ...labelled.filter((b) => occluded.current.get(b.target?.id ?? '')),
    ]
    for (const b of order) {
      if (!b.target || !b.anchor) continue
      const el = els.current.get(b.target.id)
      if (!el) continue
      const ndc = scratch.current.copy(b.anchor).project(camera)
      const w = el.offsetWidth
      const h = el.offsetHeight
      const ax = ((ndc.x + 1) / 2) * size.width
      const ay = ((1 - ndc.y) / 2) * size.height
      const moved = Boolean(occluded.current.get(b.target.id)) && heartX !== null
      let x = ax
      if (moved && heartX) {
        const right = ax >= (heartX[0] + heartX[1]) / 2
        x = right ? heartX[1] + SILHOUETTE_GAP_PX + w / 2 : heartX[0] - SILHOUETTE_GAP_PX - w / 2
      }
      const box: Box = { x: x - w / 2, y: ay - h / 2, w, h }
      let nudge = 0
      for (let i = 0; i < MAX_NUDGES; i++) {
        if (!placed.some((p) => overlaps(p, { ...box, y: box.y + nudge }))) break
        nudge += h + GAP_PX
      }
      const dx = x - ax
      // Final position (after silhouette placement and nudging) must be fully inside the viewport,
      // else the label is hidden, not clamped; it reappears when it fits again.
      const finalBox: Box = { ...box, y: box.y + nudge }
      const inView =
        ndc.z <= 1 &&
        finalBox.x >= 0 &&
        finalBox.y >= 0 &&
        finalBox.x + w <= size.width &&
        finalBox.y + h <= size.height
      el.style.transform = dx || nudge ? `translate(${dx}px, ${nudge}px)` : ''
      el.style.opacity = inView ? '' : '0'
      el.style.visibility = inView ? '' : 'hidden'
      el.dataset.hidden = moved ? 'true' : 'false'
      const hiddenText = `${b.target.id} is ${HIDDEN_TITLE}`
      el.title = moved ? hiddenText : ''
      if (moved)
        el.setAttribute(
          'aria-label',
          `${b.target.id} ${pct(probabilities[b.target.id])}, ${hiddenText}`,
        )
      else el.removeAttribute('aria-label')
      // Off-screen labels take no space, so they never push a visible label around.
      if (inView) placed.push(finalBox)
    }
  })

  useEffect(
    () => () => {
      if (retest.current !== null) window.clearTimeout(retest.current)
    },
    [],
  )

  if (!show) return null

  return (
    <>
      {bindings.map((b) => {
        if (b.target?.role !== 'vessel' || !b.anchor) return null
        const id = b.target.id
        return (
          <Html
            key={id}
            position={b.anchor}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span
              ref={(el) => {
                if (el) els.current.set(id, el)
                else els.current.delete(id)
              }}
              className={cn(
                'group num block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur-sm data-[hidden=true]:border-dashed data-[hidden=true]:border-white/80 data-[hidden=true]:bg-slate-950/90',
                id === selected
                  ? 'border-white/70 bg-slate-950/80 text-white'
                  : 'border-white/20 bg-slate-950/60 text-slate-100',
              )}
            >
              {id} {pct(probabilities[id])}
            </span>
          </Html>
        )
      })}
    </>
  )
}
