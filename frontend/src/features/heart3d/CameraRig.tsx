import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, MathUtils, type PerspectiveCamera, Vector3 } from 'three'
import { useAppStore } from '@/store/app'
import type { NodeBinding } from './useHeartModel'
import { useViewState } from './useViewState'

/** Anterior view: patient faces the viewer (+Z toward camera), slightly elevated. */
const VIEW_DIR = new Vector3(0, 0.35, 1).normalize()
const UP = new Vector3(0, 1, 0)
/** Default view: the heart fills this share of the viewport height, capped by width. */
const FILL_HEIGHT = 0.7
const FILL_WIDTH = 0.9
const SPIN_RAD_PER_S = 0.35

/**
 * Aspect-aware fit of `box` seen from direction `dir` (target -> camera): project the box corners
 * onto the view's right/up axes, then size the distance so it fills FILL_HEIGHT of the height
 * without exceeding FILL_WIDTH of the width.
 */
function fitView(box: Box3, dir: Vector3, camera: PerspectiveCamera) {
  const centre = box.getCenter(new Vector3())
  const right = new Vector3().crossVectors(UP, dir).normalize()
  const up = new Vector3().crossVectors(dir, right).normalize()
  let halfW = 0
  let halfH = 0
  let halfD = 0
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const d = new Vector3(x, y, z).sub(centre)
        halfW = Math.max(halfW, Math.abs(d.dot(right)))
        halfH = Math.max(halfH, Math.abs(d.dot(up)))
        halfD = Math.max(halfD, Math.abs(d.dot(dir)))
      }
  const tanV = Math.tan(MathUtils.degToRad(camera.fov) / 2)
  const tanH = tanV * camera.aspect
  const dist = Math.max(halfH / (tanV * FILL_HEIGHT), halfW / (tanH * FILL_WIDTH)) + halfD
  return { eye: centre.clone().addScaledVector(dir, dist), centre }
}

interface Props {
  bindings: NodeBinding[]
}

/**
 * Orbit/zoom/pan with clamped distance. Frames the default anterior view or flies to the selected
 * vessel's bounding box whenever the selection changes (3D click or result card) or Reset is hit.
 * The workspace tab stays mounted while hidden: a zero-size canvas defers the first fit, and
 * showing it again only invalidates (it never re-frames, so the user's orbit is kept).
 */
export function CameraRig({ bindings }: Props) {
  const controls = useRef<CameraControlsImpl>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const tab = useAppStore((s) => s.tab)
  const selected = useAppStore((s) => s.selectedTarget)
  const nonce = useViewState((s) => s.viewNonce)
  const spin = useViewState((s) => s.spin)
  const ready = width > 0 && height > 0
  const readyRef = useRef(ready)
  const pendingFit = useRef(true)
  /** The user orbited/zoomed since the last automatic fit: don't re-frame on resize. */
  const moved = useRef(false)

  const defaultBox = useMemo(() => {
    const box = new Box3()
    for (const b of bindings) if (b.defaultVisible) box.expandByObject(b.object)
    return box.isEmpty() ? new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)) : box
  }, [bindings])

  const frame = useCallback(
    (id: string | null, animate: boolean) => {
      const c = controls.current
      if (!c) return
      // A vessel orbits to its configured view direction (anatomy.yaml `expect_side`/`view_dir`,
      // via the GLB extras) and fits its own box; everything else gets the default anterior view.
      const vessel = bindings.find((b) => b.target?.id === id && b.target.role === 'vessel')
      const box = vessel ? new Box3().setFromObject(vessel.object) : defaultBox
      const dir = vessel?.viewDir ?? VIEW_DIR
      const { eye, centre } = fitView(box, dir, camera)
      void c.setLookAt(...eye.toArray(), ...centre.toArray(), animate)
    },
    [bindings, camera, defaultBox],
  )

  // Selection or Reset changed: re-frame (deferred while the canvas has no size).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the Reset trigger
  useEffect(() => {
    if (!readyRef.current) {
      pendingFit.current = true
      return
    }
    moved.current = false
    frame(selected, true)
  }, [selected, nonce, frame])

  // Canvas got a real size (first mount, shown again after being hidden, or resized between the
  // 3-column and stacked layouts). A resize re-frames only if the user hasn't moved the camera.
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const lastSize = useRef('')
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab changes (hidden -> shown) must re-invalidate
  useEffect(() => {
    readyRef.current = ready
    const size = `${width}x${height}`
    const resized = size !== lastSize.current
    lastSize.current = size
    if (ready && (pendingFit.current || (resized && !moved.current))) {
      pendingFit.current = false
      frame(selectedRef.current, false)
    }
    // R3F skips renders at 0x0; after becoming visible, draw the current state explicitly.
    const id = requestAnimationFrame(() => invalidate())
    return () => cancelAnimationFrame(id)
  }, [ready, width, height, tab, frame, invalidate])

  useFrame((_, delta) => {
    if (spin && controls.current) {
      void controls.current.rotate(delta * SPIN_RAD_PER_S, 0, false)
      invalidate()
    }
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.9}
      maxDistance={9}
      smoothTime={0.25}
      draggingSmoothTime={0.08}
      dollyToCursor={false}
      // Any manual interaction stops auto-spin.
      onControlStart={() => {
        moved.current = true
        useViewState.getState().setSpin(false)
      }}
    />
  )
}
