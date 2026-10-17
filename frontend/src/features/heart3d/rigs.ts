import { Color, DoubleSide, MeshPhysicalMaterial, SRGBColorSpace, type Vector3 } from 'three'
import { NEUTRAL } from '@/lib/riskColor'
import type { NodeBinding } from './useHeartModel'

export const HEART_COLOR = '#8c6670' // muted rose, darker than the vessels so they read on top
const CONTEXT_COLOR = '#aeb6c2'
/** Optional context nodes hidden by default (veins): neutral blue-grey, never on the risk scale. */
const OPTIONAL_COLOR = '#7f93ad'

/** Supply-region shader inputs, shared with the heart material (see supplyShader.ts). */
export interface SupplyUniforms {
  mask: { value: Vector3 }
  color: { value: Color }
  strength: { value: number }
}

/** Per-node material + tween state. Vessels (role "vessel") are colour-driven by probability. */
export interface Rig {
  b: NodeBinding
  kind: 'risk' | 'heart' | 'context'
  material: MeshPhysicalMaterial
  cur: Color
  from: Color
  to: Color
  curI: number
  fromI: number
  toI: number
  start: number
  /** X-ray opacity of the heart (tweened). */
  opacity: number
  /** Focus-mode dimming, 0 (full colour) .. 1 (dimmed); tweened toward the goal. */
  focus: number
  /** Set on the heart rig only. */
  supply: SupplyUniforms | null
  /** Heart rig only: the `selected` target the supply shading currently shows. */
  supplyFor: string | null
}

export function makeRig(b: NodeBinding): Rig {
  const kind =
    b.target?.role === 'vessel' ? 'risk' : b.target?.role === 'overall' ? 'heart' : 'context'
  const optional = kind === 'context' && b.optional && !b.defaultVisible
  const base =
    kind === 'heart'
      ? HEART_COLOR
      : kind === 'risk'
        ? '#8a97ad'
        : optional
          ? OPTIONAL_COLOR
          : CONTEXT_COLOR
  const material = new MeshPhysicalMaterial({
    color: base,
    emissive: base,
    emissiveIntensity: 0,
    roughness: kind === 'heart' ? 0.82 : kind === 'risk' ? 0.42 : 0.6,
    metalness: 0,
    ...(kind === 'heart'
      ? { sheen: 0.4, sheenRoughness: 0.6, sheenColor: new Color('#d9a7b0'), side: DoubleSide }
      : {}),
    ...(kind === 'risk' ? { clearcoat: 0.3, clearcoatRoughness: 0.35 } : {}),
  })
  const neutral = new Color().setRGB(...NEUTRAL, SRGBColorSpace)
  return {
    b,
    kind,
    material,
    cur: neutral.clone(),
    from: neutral.clone(),
    to: neutral.clone(),
    curI: 0.05,
    fromI: 0.05,
    toI: 0.05,
    start: 0,
    opacity: 1,
    focus: 0,
    supply: null,
    supplyFor: null,
  }
}
