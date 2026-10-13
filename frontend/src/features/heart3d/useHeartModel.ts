import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { type Mesh, type Object3D, Vector3 } from 'three'
import type { TargetInfo } from '@/api/client'

export const HEART_URL = '/models/heart.glb'

/** glTF node extras written by scripts/build_heart_glb.py (surface at `anchor`). */
interface Extras {
  anchor?: [number, number, number]
  defaultVisible?: boolean
}

export interface NodeBinding {
  name: string
  /** Set for nodes that carry a model target (bound by `targets[].node`); null for context anatomy. */
  target: TargetInfo | null
  object: Object3D
  meshes: Mesh[]
  /** World-space point on the node's surface for its label. */
  anchor: Vector3 | null
  defaultVisible: boolean
}

function readExtras(obj: Object3D): Extras {
  const hits: Extras[] = []
  obj.traverse((o) => {
    if (Array.isArray(o.userData.anchor)) hits.push(o.userData as Extras)
  })
  return hits[0] ?? {}
}

function bind(obj: Object3D, target: TargetInfo | null): NodeBinding {
  const extras = readExtras(obj)
  const meshes: Mesh[] = []
  obj.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh)
  })
  return {
    name: obj.name,
    target,
    object: obj,
    meshes,
    anchor: extras.anchor ? obj.localToWorld(new Vector3(...extras.anchor)) : null,
    defaultVisible: extras.defaultVisible ?? true,
  }
}

/**
 * Loads the GLB and binds meshes to targets by `targets[].node` (no vessel names in TS). Nodes
 * without a target (LM, aorta, veins, ...) are discovered from the file itself via their extras.
 * Targets whose node is absent are returned in `missing`. `useGLTF(url, false)`: no Draco decoder.
 */
export function useHeartModel(targets: TargetInfo[]): {
  bindings: NodeBinding[]
  missing: TargetInfo[]
} {
  const { scene } = useGLTF(HEART_URL, false)

  return useMemo(() => {
    scene.updateWorldMatrix(true, true)
    const bindings: NodeBinding[] = []
    const missing: TargetInfo[] = []
    const claimed = new Set<Object3D>()

    for (const t of targets) {
      const obj = scene.getObjectByName(t.node)
      if (!obj) {
        missing.push(t)
        continue
      }
      claimed.add(obj)
      bindings.push(bind(obj, t))
    }
    scene.traverse((o) => {
      if (claimed.has(o) || !Array.isArray(o.userData.anchor)) return
      let p = o.parent
      while (p && !claimed.has(p)) p = p.parent
      if (p) return // inside an already-bound node
      claimed.add(o)
      bindings.push(bind(o, null))
    })
    return { bindings, missing }
  }, [scene, targets])
}

useGLTF.preload(HEART_URL, false)
