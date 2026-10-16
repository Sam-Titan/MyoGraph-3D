import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Select } from '@react-three/postprocessing'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Color, DoubleSide, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { track } from '@/lib/analytics'
import { NEUTRAL, riskEmissive, riskRgb } from '@/lib/riskColor'
import { useAppStore } from '@/store/app'
import type { NodeBinding } from './useHeartModel'
import type { Probabilities } from './useProbabilities'
import { focusTarget, useViewState } from './useViewState'

const TWEEN_MS = 400
const XRAY_OPACITY = 0.25
/** Always-on selection cue (works without postprocessing): extra emissive on the selected node. */
const SELECT_BOOST = 0.35
const HEART_COLOR = '#b58b93' // muted, desaturated rose: not on the risk scale
const CONTEXT_COLOR = '#aeb6c2'
/** Optional context nodes hidden by default (veins): neutral blue-grey, never on the risk scale. */
const OPTIONAL_COLOR = '#7f93ad'
const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
type PointerEvent3D = ThreeEvent<PointerEvent>
const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** Per-node material + tween state. Vessels (role "vessel") are colour-driven by probability. */
interface Rig {
  b: NodeBinding
  kind: 'risk' | 'heart' | 'context'
  material: MeshStandardMaterial
  cur: Color
  from: Color
  to: Color
  curI: number
  fromI: number
  toI: number
  start: number
  opacity: number
}

function makeRig(b: NodeBinding): Rig {
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
  const material = new MeshStandardMaterial({
    color: base,
    emissive: base,
    emissiveIntensity: 0,
    roughness: kind === 'heart' ? 0.85 : kind === 'risk' ? 0.45 : 0.6,
    metalness: 0,
    side: kind === 'heart' ? DoubleSide : undefined,
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
  }
}

interface Props {
  bindings: NodeBinding[]
  probabilities: Probabilities
  /** From useClickGuard: false when the gesture was a drag. */
  isClick: () => boolean
}

/**
 * Renders the bound nodes with per-node materials. Colour = calibrated probability (animated
 * ~400 ms); x-ray fades the heart to 25 % with depthWrite off; click/hover drive the shared store.
 */
export function HeartModel({ bindings, probabilities, isClick }: Props) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const selected = useAppStore((s) => s.selectedTarget)
  const xray = useViewState((s) => s.xray)
  const rowHover = useViewState((s) => s.rowHover)
  const shownNodes = useViewState((s) => s.shownNodes)
  const rigs = useMemo(() => bindings.map(makeRig), [bindings])

  useLayoutEffect(() => {
    for (const r of rigs) {
      for (const m of r.b.meshes) m.material = r.material
      r.b.object.renderOrder = r.kind === 'heart' ? 0 : 1
    }
  }, [rigs])

  // Visibility: the node's defaultVisible extra, overridden by the toolbar toggle for optional nodes.
  useLayoutEffect(() => {
    for (const r of rigs) r.b.object.visible = shownNodes[r.b.name] ?? r.b.defaultVisible
    invalidate()
  }, [rigs, shownNodes, invalidate])

  // New probabilities -> start a tween from wherever the colour currently is.
  useEffect(() => {
    const now = performance.now()
    for (const r of rigs) {
      if (r.kind !== 'risk' || !r.b.target) continue
      const p = probabilities[r.b.target.id]
      r.from.copy(r.cur)
      r.fromI = r.curI
      r.to.setRGB(...(p === undefined ? NEUTRAL : riskRgb(p)), SRGBColorSpace)
      r.toI = p === undefined ? 0.05 : riskEmissive(p)
      r.start = reducedMotion() ? Number.NEGATIVE_INFINITY : now
    }
    invalidate()
  }, [rigs, probabilities, invalidate])

  // biome-ignore lint/correctness/useExhaustiveDependencies: selection/x-ray changes must request a frame
  useEffect(() => {
    invalidate()
  }, [selected, xray, rowHover, invalidate])

  // frameloop="demand": keep requesting frames only while something is still animating.
  useFrame(() => {
    const now = performance.now()
    let busy = false
    for (const r of rigs) {
      const isSelected = r.b.target !== null && r.b.target.id === selected
      const isHovered = r.b.target !== null && r.b.target.id === rowHover
      const boost = isSelected || isHovered ? SELECT_BOOST : 0
      if (r.kind === 'risk') {
        const t = Math.min(1, (now - r.start) / TWEEN_MS)
        const k = easeOut(t)
        r.cur.copy(r.from).lerp(r.to, k)
        r.curI = r.fromI + (r.toI - r.fromI) * k
        r.material.color.copy(r.cur)
        r.material.emissive.copy(r.cur)
        r.material.emissiveIntensity = r.curI + boost
        if (t < 1) busy = true
      } else if (r.kind === 'heart') {
        const goal = xray ? XRAY_OPACITY : 1
        const diff = goal - r.opacity
        r.opacity = Math.abs(diff) < 0.01 || reducedMotion() ? goal : r.opacity + diff * 0.25
        if (r.opacity !== goal) busy = true
        const see = r.opacity < 1
        if (r.material.transparent !== see) {
          r.material.transparent = see
          r.material.needsUpdate = true
        }
        r.material.opacity = r.opacity
        r.material.depthWrite = !see // posterior vessels must show through
        r.material.emissiveIntensity = boost * 0.6
      } else {
        r.material.emissiveIntensity = 0
      }
    }
    if (busy) invalidate()
  })

  const setCursor = (c: string) => {
    gl.domElement.style.cursor = c
  }

  return (
    <>
      {rigs.map((r) => {
        const target = r.b.target
        if (!target) return <primitive key={r.b.name} object={r.b.object} />
        return (
          <Select key={r.b.name} enabled={target.id === selected}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js object, not a DOM element */}
            <primitive
              object={r.b.object}
              onPointerOver={(e: PointerEvent3D) => {
                e.stopPropagation()
                setCursor('pointer')
                useViewState.getState().setHover({
                  id: target.id,
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }}
              onPointerMove={(e: PointerEvent3D) => {
                e.stopPropagation()
                useViewState.getState().setHover({
                  id: target.id,
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }}
              onPointerOut={() => {
                setCursor('')
                const { hover, setHover } = useViewState.getState()
                if (hover?.id === target.id) setHover(null)
              }}
              onClick={(e: PointerEvent3D) => {
                e.stopPropagation()
                if (isClick()) {
                  focusTarget(target.id)
                  track('target_selected', { target: target.id, source: '3d' })
                }
              }}
            />
          </Select>
        )
      })}
    </>
  )
}
