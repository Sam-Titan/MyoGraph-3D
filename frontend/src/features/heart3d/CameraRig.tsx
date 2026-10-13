import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, MathUtils, type PerspectiveCamera, Sphere, Vector3 } from 'three'
import { useAppStore } from '@/store/app'
import type { NodeBinding } from './useHeartModel'
import { useViewState } from './useViewState'

/** Anterior view: patient faces the viewer (+Z toward camera), slightly elevated. */
const VIEW_DIR = new Vector3(0, 0.35, 1).normalize()
const FIT_PADDING = 0.25
const SPIN_RAD_PER_S = 0.35

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

  const defaultSphere = useMemo(() => {
    const box = new Box3()
    for (const b of bindings) if (b.defaultVisible) box.expandByObject(b.object)
    return box.isEmpty() ? new Sphere(new Vector3(), 1.2) : box.getBoundingSphere(new Sphere())
  }, [bindings])

  const frame = useCallback(
    (id: string | null, animate: boolean) => {
      const c = controls.current
      if (!c) return
      const vessel = bindings.find((b) => b.target?.id === id && b.target.role === 'vessel')
      if (vessel) {
        const box = new Box3().setFromObject(vessel.object)
        void c.fitToBox(box, animate, {
          paddingLeft: FIT_PADDING,
          paddingRight: FIT_PADDING,
          paddingTop: FIT_PADDING,
          paddingBottom: FIT_PADDING,
        })
        return
      }
      const vHalf = MathUtils.degToRad(camera.fov) / 2
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
      const dist = (defaultSphere.radius / Math.sin(Math.min(vHalf, hHalf))) * 1.05
      const eye = defaultSphere.center.clone().addScaledVector(VIEW_DIR, dist)
      void c.setLookAt(...eye.toArray(), ...defaultSphere.center.toArray(), animate)
    },
    [bindings, camera, defaultSphere],
  )

  // Selection or Reset changed: re-frame (deferred while the canvas has no size).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the Reset trigger
  useEffect(() => {
    if (!readyRef.current) {
      pendingFit.current = true
      return
    }
    frame(selected, true)
  }, [selected, nonce, frame])

  // Canvas got a real size (first mount, or shown again after being hidden).
  // biome-ignore lint/correctness/useExhaustiveDependencies: width/height/tab changes (hidden -> shown, resize) must re-invalidate
  useEffect(() => {
    readyRef.current = ready
    if (ready && pendingFit.current) {
      pendingFit.current = false
      frame(selected, false)
    }
    // R3F skips renders at 0x0; after becoming visible, draw the current state explicitly.
    const id = requestAnimationFrame(() => invalidate())
    return () => cancelAnimationFrame(id)
  }, [ready, width, height, tab, frame, selected, invalidate])

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
      onControlStart={() => useViewState.getState().setSpin(false)}
    />
  )
}
