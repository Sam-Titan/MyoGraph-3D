import { Outlines } from '@react-three/drei'
import { createPortal, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Fragment, useEffect, useLayoutEffect, useMemo } from 'react'
import { Color, type Mesh, SRGBColorSpace } from 'three'
import { track } from '@/lib/analytics'
import { NEUTRAL, riskEmissive, riskRgb } from '@/lib/riskColor'
import { useAppStore } from '@/store/app'
import { HEART_COLOR, makeRig, type Rig } from './rigs'
import { injectSupply, makeSupplyUniforms, SUPPLY_MAX } from './supplyShader'
import type { NodeBinding } from './useHeartModel'
import type { Probabilities } from './useProbabilities'
import { focusTarget, useViewState } from './useViewState'

const TWEEN_MS = 400
const FOCUS_S = 0.3
const XRAY_OPACITY = 0.25
/** Extra emissive on the selected / hovered node. */
const SELECT_BOOST = 0.35
/** Focus mode: non-selected vessels fade to 35 % and lose 65 % of their saturation. */
const FOCUS_DIM = 0.65
const HEART_FOCUS_DIM = 0.18
const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
type PointerEvent3D = ThreeEvent<PointerEvent>
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const HEART = new Color(HEART_COLOR)
const grey = new Color()

/** Moves `x` toward `goal` by at most `step`. */
const approach = (x: number, goal: number, step: number): number =>
  Math.abs(goal - x) <= step ? goal : x + Math.sign(goal - x) * step

interface Props {
  bindings: NodeBinding[]
  probabilities: Probabilities
  /** From useClickGuard: false when the gesture was a drag. */
  isClick: () => boolean
}

/** Inverted-hull outline on every mesh of a vessel: thin and dark, thicker and light when active. */
function VesselOutlines({ rig }: { rig: Rig }) {
  const id = rig.b.target?.id
  const active = useAppStore((s) => s.selectedTarget === id)
  const hot = useViewState((s) => s.hover?.id === id || s.rowHover === id)
  const on = active || hot
  return (
    <>
      {rig.b.meshes.map((m: Mesh) => (
        <Fragment key={m.uuid}>
          {createPortal(
            <Outlines
              angle={0}
              thickness={on ? 4 : 2}
              color={on ? '#f4f9ff' : '#060b16'}
              toneMapped={false}
            />,
            m,
          )}
        </Fragment>
      ))}
    </>
  )
}

/**
 * Renders the bound nodes with per-node materials. Colour = calibrated probability (animated
 * ~400 ms) and nothing else; identity comes from outlines, labels and position. A selected vessel
 * puts the others into focus mode (faded, desaturated) and tints its supply region on the heart.
 */
export function HeartModel({ bindings, probabilities, isClick }: Props) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const selected = useAppStore((s) => s.selectedTarget)
  const xray = useViewState((s) => s.xray)
  const supply = useViewState((s) => s.supply)
  const hoverId = useViewState((s) => s.hover?.id ?? null)
  const rowHover = useViewState((s) => s.rowHover)
  const shownNodes = useViewState((s) => s.shownNodes)
  const rigs = useMemo(
    () =>
      bindings.map((b) => {
        const r = makeRig(b)
        if (r.kind === 'heart') {
          r.supply = makeSupplyUniforms()
          injectSupply(r.material, r.supply)
        }
        return r
      }),
    [bindings],
  )

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: selection/view changes must request a frame
  useEffect(() => {
    invalidate()
  }, [selected, xray, supply, hoverId, rowHover, invalidate])

  // frameloop="demand": keep requesting frames only while something is still animating.
  useFrame((_, delta) => {
    const now = performance.now()
    const step = reducedMotion() ? 1 : Math.min(delta, 0.1) / FOCUS_S
    const selRig = rigs.find((r) => r.kind === 'risk' && r.b.target?.id === selected)
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
        if (t < 1) busy = true
        const goal = selRig && !isSelected ? 1 : 0
        r.focus = approach(r.focus, goal, step)
        if (r.focus !== goal) busy = true
        const lum = r.cur.r * 0.2126 + r.cur.g * 0.7152 + r.cur.b * 0.0722
        r.material.color.copy(r.cur).lerp(grey.setRGB(lum, lum, lum), FOCUS_DIM * r.focus)
        r.material.emissive.copy(r.material.color)
        r.material.emissiveIntensity = (r.curI + boost) * (1 - 0.7 * r.focus)
        const op = 1 - FOCUS_DIM * r.focus
        const see = op < 1
        if (r.material.transparent !== see) {
          r.material.transparent = see
          r.material.needsUpdate = true
        }
        r.material.opacity = op
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
        const fgoal = selRig ? 1 : 0
        r.focus = approach(r.focus, fgoal, step)
        if (r.focus !== fgoal) busy = true
        r.material.color.copy(HEART).multiplyScalar(1 - HEART_FOCUS_DIM * r.focus)
        r.material.emissive.copy(HEART)
        r.material.emissiveIntensity = boost * 0.6
        if (r.supply) {
          const ch = selRig?.b.target ? r.b.territoryChannels.indexOf(selRig.b.target.id) : -1
          if (ch >= 0 && selRig) {
            r.supply.mask.value.set(ch === 0 ? 1 : 0, ch === 1 ? 1 : 0, ch === 2 ? 1 : 0)
            r.supply.color.value.copy(selRig.cur)
          }
          const sgoal = supply && ch >= 0 ? SUPPLY_MAX : 0
          const cur = r.supply.strength.value
          r.supply.strength.value = approach(cur, sgoal, step * SUPPLY_MAX)
          if (r.supply.strength.value !== sgoal) busy = true
        }
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
          <Fragment key={r.b.name}>
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
            {r.kind === 'risk' && <VesselOutlines rig={r} />}
          </Fragment>
        )
      })}
    </>
  )
}
