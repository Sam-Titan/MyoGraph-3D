import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Box3, Vector3 } from 'three'
import type { NodeBinding } from './useHeartModel'

/**
 * Dev/e2e only (the caller renders it under `import.meta.env.DEV`, so production builds drop it):
 * writes the camera distance (`data-cam-dist`) and the heart's projected box in canvas px
 * (`data-heart-box`, "x0,y0,x1,y1"; the same overall-heart node the label chips keep clear of) to
 * the <canvas> element. It only does work on a frame where the
 * camera or the canvas size changed, and frames themselves only render on demand.
 */
export function TestProbe({ bindings }: { bindings: NodeBinding[] }) {
  const box = useRef(new Box3())
  const v = useRef(new Vector3())
  const last = useRef({ key: '', size: '' })
  useFrame(({ camera, size, controls, gl }) => {
    const el = gl.domElement
    const key = camera.matrixWorld.elements.join()
    const dims = `${size.width}x${size.height}`
    if (key === last.current.key && dims === last.current.size) return
    last.current = { key, size: dims }
    const target = (controls as { getTarget?: (out: Vector3) => Vector3 } | null)?.getTarget?.(
      v.current,
    )
    if (target) el.dataset.camDist = camera.position.distanceTo(target).toFixed(3)
    // The model never moves, so its box is taken once; only the projection follows the camera.
    const heart = bindings.find((b) => b.target?.role === 'overall')
    if (box.current.isEmpty() && heart) box.current.setFromObject(heart.object)
    if (box.current.isEmpty()) return
    const { min, max } = box.current
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      v.current
        .set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
        .project(camera)
      const x = (v.current.x * 0.5 + 0.5) * size.width
      const y = (-v.current.y * 0.5 + 0.5) * size.height
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    el.dataset.heartBox = [x0, y0, x1, y1].map((n) => n.toFixed(1)).join(',')
  })
  return null
}
