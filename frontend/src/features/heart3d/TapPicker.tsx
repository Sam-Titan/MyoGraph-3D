import { useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useMemo } from 'react'
import { type Mesh, type Object3D, Raycaster, Vector2, Vector3 } from 'three'
import { nearestWithin, type ScreenPolyline, visibleRuns } from './tapTolerance'
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

const isShown = (o: Object3D): boolean => {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}

/** Picks a vessel by (clientX, clientY): the id nearest to a tap within the tolerance, or null. */
export type PickVessel = (clientX: number, clientY: number) => string | null

/**
 * Inside the Canvas: keeps `pick` pointing at a function that projects each vessel's sample points
 * to the screen and returns the nearest one within the tap tolerance, measured to the lines between
 * the points. Points behind the first opaque surface along the tap ray are ignored, so a vessel
 * hidden by the heart cannot win (with x-ray on, the heart is transparent and hides nothing). Used when a finger lands
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
  const scene = useThree((s) => s.scene)
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
    const ray = new Raycaster()
    /** Camera distance of the first opaque, shown mesh under the tap; undefined when the ray hits none. */
    const surfaceDepth = (x: number, y: number, w: number, h: number): number | undefined => {
      ray.setFromCamera(new Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera)
      const occluders: Object3D[] = []
      scene.traverseVisible((o) => {
        const m = (o as Mesh).material
        if ((o as Mesh).isMesh && m && !Array.isArray(m) && !m.transparent) occluders.push(o)
      })
      return ray.intersectObjects(occluders, false)[0]?.distance
    }
    pick.current = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const surface = surfaceDepth(x, y, rect.width, rect.height)
      const lines: ScreenPolyline[] = []
      for (const s of samples) {
        if (!isShown(s.mesh)) continue
        s.mesh.updateWorldMatrix(true, false)
        const pts = s.points.flatMap((p) => {
          v.copy(p).applyMatrix4(s.mesh.matrixWorld)
          const depth = v.distanceTo(camera.position)
          v.project(camera)
          if (v.z > 1) return []
          return [{ x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, depth }]
        })
        for (const run of visibleRuns(pts, surface)) lines.push({ id: s.id, pts: run })
      }
      return nearestWithin(lines, x, y)
    }
    return () => {
      pick.current = () => null
    }
  }, [samples, camera, dom, scene, pick])
  return null
}
