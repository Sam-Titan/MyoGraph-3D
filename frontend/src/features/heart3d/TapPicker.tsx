import { useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useMemo } from 'react'
import { type Mesh, type Object3D, Vector3 } from 'three'
import { nearestWithin, type ScreenPoint } from './tapTolerance'
import type { NodeBinding } from './useHeartModel'

/** Surface points kept per mesh: plenty to trace an artery, cheap to project on a tap. */
const SAMPLES_PER_MESH = 160

/** Evenly spaced local-space vertices of one mesh. */
function sampleVertices(mesh: Mesh): Vector3[] {
  const attr = mesh.geometry.getAttribute('position')
  if (!attr) return []
  const stride = Math.max(1, Math.floor(attr.count / SAMPLES_PER_MESH))
  const out: Vector3[] = []
  for (let i = 0; i < attr.count; i += stride) out.push(new Vector3().fromBufferAttribute(attr, i))
  return out
}

/** Picks a vessel by (clientX, clientY): the id nearest to a tap within the tolerance, or null. */
export type PickVessel = (clientX: number, clientY: number) => string | null

/**
 * Inside the Canvas: keeps `pick` pointing at a function that projects each vessel's sample points
 * to the screen and returns the nearest one within the tap tolerance. Used when a finger lands
 * beside a thin artery (the raycast misses) and for long-press tooltips. Projection happens only on
 * demand, never per frame.
 */
export function TapPicker({
  bindings,
  pick,
}: {
  bindings: NodeBinding[]
  pick: RefObject<PickVessel>
}) {
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const samples = useMemo(
    () =>
      bindings
        .filter((b) => b.target?.role === 'vessel')
        .flatMap((b) =>
          b.meshes.map((mesh) => ({ id: b.target?.id ?? '', mesh, points: sampleVertices(mesh) })),
        ),
    [bindings],
  )

  useEffect(() => {
    const v = new Vector3()
    pick.current = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const projected: ScreenPoint[] = []
      for (const s of samples) {
        let shown = true
        for (let o: Object3D | null = s.mesh; o; o = o.parent) if (!o.visible) shown = false
        if (!shown) continue
        s.mesh.updateWorldMatrix(true, false)
        for (const p of s.points) {
          v.copy(p).applyMatrix4(s.mesh.matrixWorld).project(camera)
          if (v.z > 1) continue
          projected.push({
            id: s.id,
            x: ((v.x + 1) / 2) * rect.width,
            y: ((1 - v.y) / 2) * rect.height,
          })
        }
      }
      return nearestWithin(projected, x, y)
    }
    return () => {
      pick.current = () => null
    }
  }, [samples, camera, dom, pick])
  return null
}
