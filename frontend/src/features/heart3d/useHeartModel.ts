import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { type Mesh, type Object3D, Vector3 } from 'three'
import type { TargetInfo } from '@/api/client'

/** Phones / coarse pointers load the half-budget LOD (same node names and extras). */
const COMPACT =
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse), (max-width: 640px)').matches
export const IS_COMPACT = COMPACT
export const HEART_URL = COMPACT ? '/models/heart.mobile.glb' : '/models/heart.glb'

/** glTF node extras written by scripts/build_heart_glb.py (surface at `anchor`). */
interface Extras {
  anchor?: [number, number, number]
  defaultVisible?: boolean
  optional?: boolean
  /** The anchor is behind the heart in the default view (no visible near-tie vertex). */
  anchorHidden?: boolean
  /** Camera direction (target -> camera) when this node is selected; from anatomy.yaml. */
  viewDir?: [number, number, number] | null
  /** Heart node only: target id per component of the `_TERRITORY` vertex attribute. */
  territoryChannels?: string[]
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
  /** Context node that may be absent / is user-toggleable (e.g. veins). */
  optional: boolean
  anchorHidden: boolean
  /** Unit direction the camera orbits to on selection; null keeps the default anterior view. */
  viewDir: Vector3 | null
  /** Heart node only: target id per `territory` attribute channel (supply-region weights). */
  territoryChannels: string[]
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
    optional: extras.optional ?? false,
    anchorHidden: extras.anchorHidden ?? false,
    viewDir: extras.viewDir ? new Vector3(...extras.viewDir).normalize() : null,
    territoryChannels: extras.territoryChannels ?? [],
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
    // The GLB ships no NORMAL attribute (smaller files; vertices are already merged), and without
    // one three renders flat-shaded facets. Compute smooth normals once per geometry.
    scene.traverse((o) => {
      const g = (o as Mesh).geometry
      if (!(o as Mesh).isMesh) return
      if (!g.attributes.normal) g.computeVertexNormals()
      // GLTFLoader lower-cases custom attributes (`_territory`); GLSL names are friendlier without the underscore.
      if (g.attributes._territory && !g.attributes.territory)
        g.setAttribute('territory', g.attributes._territory)
    })
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
