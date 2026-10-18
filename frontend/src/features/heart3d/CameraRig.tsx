import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, MathUtils, type PerspectiveCamera, Vector3 } from 'three'
import { useAppStore } from '@/store/app'
import { isPhone, PHONE_CHIP_RESERVE_PX } from './phone'
import type { NodeBinding } from './useHeartModel'
import { useViewState } from './useViewState'

/** Anterior view: patient faces the viewer (+Z toward camera), slightly elevated. */
const VIEW_DIR = new Vector3(0, 0.35, 1).normalize()
const UP = new Vector3(0, 1, 0)
/** Default view: the heart fills this share of the viewport height, capped by width. */
const FILL_HEIGHT = 0.7
/** Stacked layout (<1280px): the canvas stops above the legend, so the heart may fill more of it. The corner-projected box overestimates the heart, so 1.25 gives ~280px of the 440px viewport. */
const FILL_HEIGHT_STACKED = 1.25
const FILL_WIDTH = 0.9
const SPIN_RAD_PER_S = 0.35
/**
 * Touch pinch zooms by 0.95^(spread px / 8 * dollySpeed). At 1 a 4x spread zoomed only ~1.3x on a
 * phone; 3.5 makes it roughly proportional. Wheel zoom uses the same speed, so only touch devices change.
 */
const DOLLY_SPEED_TOUCH = 3.5
const DOLLY_SPEED = window.matchMedia('(pointer: coarse)').matches ? DOLLY_SPEED_TOUCH : 1

/**
 * Aspect-aware fit of `box` seen from direction `dir` (target -> camera): project the box corners
 * onto the view's right/up axes, then size the distance so it fills FILL_HEIGHT of the height
 * without exceeding FILL_WIDTH of the width.
 */
function fitView(box: Box3, dir: Vector3, camera: PerspectiveCamera, canvasWidth: number) {
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
  const fillHeight = window.matchMedia('(min-width: 1280px)').matches
    ? FILL_HEIGHT
    : FILL_HEIGHT_STACKED
  // Phones keep a column free on each side for the label chips, so they never sit on the heart.
  const fillWidth =
    isPhone() && canvasWidth > 0
      ? Math.min(FILL_WIDTH, Math.max(0.4, 1 - PHONE_CHIP_RESERVE_PX / canvasWidth))
      : FILL_WIDTH
  const dist = Math.max(halfH / (tanV * fillHeight), halfW / (tanH * fillWidth)) + halfD
  return { eye: centre.clone().addScaledVector(dir, dist), centre }
}

interface Props {
  bindings: NodeBinding[]
}

/**
 * Orbit/zoom/pan with clamped distance. Frames the default anterior view or orbits to the selected
 * vessel's view direction (whole heart stays framed) whenever the selection changes (3D click or result card) or Reset is hit.
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
  const override = useViewState((s) => s.viewDirOverride)
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
      // via the GLB extras) but always frames the whole heart; the vessel is shown by highlight only.
      const vessel = bindings.find((b) => b.target?.id === id && b.target.role === 'vessel')
      const dir = override ? new Vector3(...override).normalize() : (vessel?.viewDir ?? VIEW_DIR)
      const { eye, centre } = fitView(defaultBox, dir, camera, width)
      void c.setLookAt(...eye.toArray(), ...centre.toArray(), animate)
    },
    [bindings, camera, defaultBox, override, width],
  )

  // Selection or Reset changed: re-frame (deferred while the canvas has no size).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the Reset trigger
  useEffect(() => {
    if (!readyRef.current) {
      pendingFit.current = true
      return
    }
    moved.current = false
    // Reduced motion: cut straight to the view instead of flying.
    frame(selected, !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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

  // frameloop="demand": turning Spin on must request the first frame, which then keeps requesting more.
  useEffect(() => {
    if (spin) invalidate()
  }, [spin, invalidate])

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
      dollySpeed={DOLLY_SPEED}
      dollyToCursor={false}
      // Any manual interaction stops auto-spin.
      onControlStart={() => {
        moved.current = true
        useViewState.getState().setSpin(false)
      }}
    />
  )
}
