import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Raycaster, Vector3 } from 'three'
import { getEls, type LabelRegistry } from './labelRegistry'
import type { NodeBinding } from './useHeartModel'
import { useViewState } from './useViewState'

const GAP_PX = 3
const MARGIN_PX = 4
/** Chips sit this far (px) clear of the heart's projected silhouette. */
const SILHOUETTE_GAP_PX = 18
/** A ray hit this much nearer than the anchor (scene units, heart ~2 tall) means "behind the heart". */
const OCCLUSION_EPS = 0.03
/** Re-test occlusion at most this often during camera animation (heart raycast is not free). */
const OCCLUSION_INTERVAL_MS = 100
const HIDDEN_TITLE = 'is behind the heart from this angle (try X-ray, or select it to rotate)'

interface Slot {
  id: string
  ax: number
  ay: number
  w: number
  h: number
  x: number
  y: number
  side: 1 | -1
  hidden: boolean
}

/** Push boxes apart vertically (top to bottom, then back up from the floor) so none overlap. */
function relax(slots: Slot[], height: number): void {
  slots.sort((a, b) => a.y - b.y)
  for (let i = 1; i < slots.length; i++) {
    const min = slots[i - 1].y + (slots[i - 1].h + slots[i].h) / 2 + GAP_PX
    if (slots[i].y < min) slots[i].y = min
  }
  const last = slots.at(-1)
  if (last) last.y = Math.min(last.y, height - MARGIN_PX - last.h / 2)
  for (let i = slots.length - 2; i >= 0; i--) {
    const max = slots[i + 1].y - (slots[i + 1].h + slots[i].h) / 2 - GAP_PX
    if (slots[i].y > max) slots[i].y = max
  }
  const first = slots[0]
  if (first) first.y = Math.max(first.y, MARGIN_PX + first.h / 2)
}

/**
 * Inside the Canvas: projects each vessel's `anchor` and writes the chip + leader-line positions
 * to the DOM nodes in `registry` (no React state, so no re-render per frame). Chips go outside the
 * heart's projected silhouette on the anchor's side; each side is relaxed vertically so chips never
 * overlap. When the canvas is too narrow for that (phones) the chip is clamped inside the view and
 * its leader line gets longer. A chip whose anchor is behind the heart (X-ray off) is dashed.
 */
export function LabelSync({
  bindings,
  registry,
}: {
  bindings: NodeBinding[]
  registry: LabelRegistry
}) {
  const xray = useViewState((s) => s.xray)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const scratch = useRef(new Vector3())
  const raycaster = useRef(new Raycaster())
  const occluded = useRef(new Map<string, boolean>())
  const lastTest = useRef(Number.NEGATIVE_INFINITY)
  const retest = useRef<number | null>(null)
  const heart = bindings.find((b) => b.target?.role === 'overall') ?? null

  useFrame(() => {
    const labelled = bindings.filter((b) => b.target?.role === 'vessel' && b.anchor)
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

    // Heart's projected horizontal extent (corner projection is conservative for a convex-ish organ).
    let lo = size.width * 0.25
    let hi = size.width * 0.75
    if (heart) {
      const bb = new Box3().setFromObject(heart.object)
      lo = Number.POSITIVE_INFINITY
      hi = Number.NEGATIVE_INFINITY
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y])
          for (const z of [bb.min.z, bb.max.z]) {
            const px = ((scratch.current.set(x, y, z).project(camera).x + 1) / 2) * size.width
            lo = Math.min(lo, px)
            hi = Math.max(hi, px)
          }
    }
    const mid = (lo + hi) / 2

    const slots: Slot[] = []
    for (const b of labelled) {
      if (!b.target || !b.anchor) continue
      const els = getEls(registry, b.target.id)
      if (!els.chip) continue
      const ndc = scratch.current.copy(b.anchor).project(camera)
      const ax = ((ndc.x + 1) / 2) * size.width
      const ay = ((1 - ndc.y) / 2) * size.height
      const w = els.chip.offsetWidth
      const h = els.chip.offsetHeight
      const side: 1 | -1 = ax >= mid ? 1 : -1
      const wanted = side > 0 ? hi + SILHOUETTE_GAP_PX + w / 2 : lo - SILHOUETTE_GAP_PX - w / 2
      const x = Math.min(size.width - MARGIN_PX - w / 2, Math.max(MARGIN_PX + w / 2, wanted))
      slots.push({
        id: b.target.id,
        ax,
        ay,
        w,
        h,
        x,
        y: ay,
        side,
        hidden: Boolean(occluded.current.get(b.target.id)),
      })
    }
    for (const side of [1, -1] as const) {
      relax(
        slots.filter((s) => s.side === side),
        size.height,
      )
    }

    const show = size.width > 0 && size.height > 0
    for (const s of slots) {
      const els = getEls(registry, s.id)
      const { chip, line, dot } = els
      if (!chip) continue
      chip.style.transform = `translate(${s.x - s.w / 2}px, ${s.y - s.h / 2}px)`
      chip.classList.toggle('invisible', !show)
      chip.dataset.hidden = s.hidden ? 'true' : 'false'
      if (s.hidden) chip.title = `${s.id} ${HIDDEN_TITLE}`
      else chip.removeAttribute('title')
      chip.dataset.side = s.side > 0 ? 'right' : 'left'
      if (line && dot) {
        const x1 = s.x - s.side * (s.w / 2)
        line.setAttribute('x1', String(x1))
        line.setAttribute('y1', String(s.y))
        line.setAttribute('x2', String(s.ax))
        line.setAttribute('y2', String(s.ay))
        dot.setAttribute('cx', String(s.ax))
        dot.setAttribute('cy', String(s.ay))
        const dash = s.hidden ? '4 3' : ''
        if (dash) line.setAttribute('stroke-dasharray', dash)
        else line.removeAttribute('stroke-dasharray')
        dot.setAttribute('fill', s.hidden ? 'none' : 'currentColor')
        line.setAttribute('visibility', show ? 'visible' : 'hidden')
        dot.setAttribute('visibility', show ? 'visible' : 'hidden')
      }
    }
  })

  useEffect(
    () => () => {
      if (retest.current !== null) window.clearTimeout(retest.current)
    },
    [],
  )
  return null
}
