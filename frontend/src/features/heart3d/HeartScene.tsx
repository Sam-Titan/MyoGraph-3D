import { useProgress } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type RefObject, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TargetInfo } from '@/api/client'
import { StoryPlayer } from '@/features/story/StoryPlayer'
import { useStory } from '@/features/story/useStory'
import { track } from '@/lib/analytics'
import { overallTarget } from '@/lib/features'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { CameraRig } from './CameraRig'
import { FrameBudget } from './FrameBudget'
import { HeartModel } from './HeartModel'
import { HoverTooltip } from './HoverTooltip'
import { LabelChips } from './LabelChips'
import { LabelSync } from './LabelSync'
import { Legend } from './Legend'
import type { LabelRegistry } from './labelRegistry'
import { OrientationMarker, OrientationSync } from './OrientationMarker'
import { type PickVessel, TapPicker } from './TapPicker'
import { Toolbar } from './Toolbar'
import { useClickGuard } from './useClickGuard'
import { IS_COMPACT, useHeartModel } from './useHeartModel'
import { type Probabilities, useProbabilities, useRanges, useThresholds } from './useProbabilities'
import { focusTarget, useViewState } from './useViewState'
import { bestVessels, presetDir, VIEW_PRESETS } from './viewPresets'
import { SOFTWARE_GL } from './webgl'

function ModelProgress() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <p
      role="status"
      className="num pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-viewport-muted"
    >
      Loading heart model… {Math.round(progress)}%
    </p>
  )
}

/**
 * Test/screenshot hook: marks the container `data-ready` once a frame has rendered with a prediction
 * and bumps `data-frame` per frame. Written straight to the DOM node, so frames cause no re-render.
 */
function ReadySignal({
  container,
  hasPrediction,
}: {
  container: RefObject<HTMLDivElement | null>
  hasPrediction: boolean
}) {
  useFrame(() => {
    const el = container.current
    if (!el || !hasPrediction) return
    el.dataset.ready = 'true'
    el.dataset.frame = String(Number(el.dataset.frame ?? 0) + 1)
  })
  return null
}

/** The vessel whose supply area is tinted on the heart (null when the tint is off or nothing is selected). */
function useSupplyVessel(targets: TargetInfo[]): TargetInfo | null {
  const selected = useAppStore((s) => s.selectedTarget)
  const supply = useViewState((s) => s.supply)
  return (supply && targets.find((t) => t.id === selected && t.role === 'vessel')) || null
}

/**
 * Explains the red/amber/green tint on the heart surface while a vessel is selected. Wide screens
 * float it over the heart; narrower ones put the same sentence in the legend, clear of the chips.
 */
function SupplyCaption({ vessel }: { vessel: TargetInfo | null }) {
  if (!vessel) return null
  return (
    <p className="pointer-events-none self-start rounded bg-slate-950/60 px-2 py-1 text-xs text-viewport-muted backdrop-blur-sm max-xl:hidden">
      Shaded area: approximate region the {vessel.id} supplies
    </p>
  )
}

const DPR_STEPS = [IS_COMPACT ? 1.25 : 1.5, 1, 0.75] as const

/** True while the viewport is on screen and the browser tab is visible (else rendering pauses to save battery). */
function useRendering(container: RefObject<HTMLDivElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true)
  const [tabVisible, setTabVisible] = useState(!document.hidden)
  useEffect(() => {
    const el = container.current
    const io = new IntersectionObserver((entries) =>
      setOnScreen(entries.some((e) => e.isIntersecting)),
    )
    if (el) io.observe(el)
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [container])
  return onScreen && tabVisible
}

/** Draws one frame when rendering resumes (frameloop="demand" only renders on invalidate). */
function ResumeFrame({ rendering }: { rendering: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    // One frame later: the Canvas applies the new frameloop in its own effect, and invalidate is a no-op while it is 'never'.
    const id = requestAnimationFrame(() => {
      if (rendering) invalidate()
    })
    return () => cancelAnimationFrame(id)
  }, [rendering, invalidate])
  return null
}

/** A real touch/pen pointer (a plain MouseEvent or a mouse has no such pointerType). */
const isTouchLike = (e: { pointerType?: string }): boolean =>
  e.pointerType === 'touch' || e.pointerType === 'pen'

/** Touch hold this long (ms) without moving shows the vessel tooltip instead of selecting. */
const LONG_PRESS_MS = 500
const TOOLTIP_MS = 3000

/**
 * Touch gestures on the viewport that the canvas events can't express: a long press shows the
 * tooltip of the vessel under the finger (or nearest within the tap tolerance), and the click that
 * follows it must not also select. Returns `suppressed()` for the click handlers.
 */
function useLongPress(
  container: RefObject<HTMLDivElement | null>,
  pick: RefObject<PickVessel>,
): () => boolean {
  const fired = useRef(false)
  useEffect(() => {
    const el = container.current
    if (!el) return
    let timer: number | undefined
    let hide: number | undefined
    let origin: { x: number; y: number } | null = null
    const clear = () => {
      window.clearTimeout(timer)
      timer = undefined
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      fired.current = false
      window.clearTimeout(hide)
      useViewState.getState().setHover(null)
      if (origin) return clear() // second finger: it is a pinch, not a hold
      origin = { x: e.clientX, y: e.clientY }
      timer = window.setTimeout(() => {
        const id = pick.current(origin?.x ?? 0, origin?.y ?? 0)
        if (!id || !origin) return
        fired.current = true
        const rect = el.getBoundingClientRect()
        useViewState.getState().setHover({ id, x: origin.x - rect.left, y: origin.y - rect.top })
        hide = window.setTimeout(() => useViewState.getState().setHover(null), TOOLTIP_MS)
      }, LONG_PRESS_MS)
    }
    const move = (e: PointerEvent) => {
      if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >= 8) clear()
    }
    const end = () => {
      clear()
      origin = null
    }
    el.addEventListener('pointerdown', down, { capture: true })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      clear()
      window.clearTimeout(hide)
      el.removeEventListener('pointerdown', down, { capture: true })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [container, pick])
  return useCallback(() => fired.current, [])
}

interface SceneProps {
  targets: TargetInfo[]
  probabilities: Probabilities
  isClick: () => boolean
  registry: LabelRegistry
  pick: RefObject<PickVessel>
  onDecline: () => void
}

function Scene({ targets, probabilities, isClick, registry, pick, onDecline }: SceneProps) {
  const { bindings, missing } = useHeartModel(targets)

  // Hidden-by-default context nodes (read from the GLB extras) become toolbar toggles.
  useEffect(() => {
    const names = bindings
      .filter((b) => !b.target && b.optional && !b.defaultVisible)
      .map((b) => b.name)
    useViewState.getState().setToggleableNodes(names)
  }, [bindings])

  // View presets resolved from the nodes' viewDir extras (Front / Left side / Underside).
  useEffect(() => {
    useViewState.getState().setViewPresets(
      VIEW_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        dir: presetDir(p, bindings),
        best: bestVessels(p, bindings),
      })),
    )
  }, [bindings])

  useEffect(() => {
    for (const t of missing) {
      console.error(`heart.glb has no node "${t.node}" for target ${t.id}`)
      toast.error(`The 3D model is missing the mesh for ${t.id}.`, { id: `missing-${t.node}` })
    }
  }, [missing])

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      <directionalLight position={[-4, -2, 3]} intensity={0.7} />
      <directionalLight position={[0, 3, -4]} intensity={0.6} />
      {/* soft cool rim from behind-left so the silhouette separates from the backdrop */}
      <directionalLight position={[-4, 1, -3]} intensity={0.9} color="#9ec5ff" />
      <HeartModel bindings={bindings} probabilities={probabilities} isClick={isClick} pick={pick} />
      <LabelSync bindings={bindings} registry={registry} />
      <CameraRig bindings={bindings} />
      <TapPicker bindings={bindings} pick={pick} />
      <FrameBudget onDecline={onDecline} />
    </>
  )
}

/**
 * The R3F canvas + overlays. No-GPU settings (SPEC 6.3): frameloop="demand", dpr <= 1.5, no shadows,
 * flat tone mapping so scene colours match the legend. Outlines are drei inverted-hull meshes (no
 * post-processing pass). Software GL starts without MSAA at dpr 1; every frame-budget decline
 * lowers dpr one more step (1.5/1.25 -> 1 -> 0.75) and never raises it again.
 */
export default function HeartScene({ targets }: { targets: TargetInfo[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendering = useRendering(containerRef)
  const pick = useRef<PickVessel>(() => null)
  const clickGuard = useClickGuard(containerRef)
  const longPressed = useLongPress(containerRef, pick)
  const isClick = useCallback(() => clickGuard() && !longPressed(), [clickGuard, longPressed])
  const probabilities = useProbabilities()
  const thresholds = useThresholds()
  const ranges = useRanges()
  const overall = overallTarget(targets)
  // Device-pixel-ratio ladder: each frame-budget decline steps down one rung and never back up.
  const [rung, setRung] = useState(SOFTWARE_GL ? 1 : 0)
  const maxDpr = DPR_STEPS[rung]
  const registry = useRef<LabelRegistry>(new Map()).current
  const onDecline = () => setRung((r) => Math.min(r + 1, DPR_STEPS.length - 1))
  const tab = useAppStore((s) => s.tab)
  const storyActive = useStory((s) => s.active !== null)
  const supplyVessel = useSupplyVessel(targets)

  // Esc resets the selection and view (Tab/Enter work natively on the label chips and key rows).
  useEffect(() => {
    if (tab !== 'workspace' || !overall) return
    const onKey = (e: KeyboardEvent) => {
      // While a story plays, Esc exits the story instead (handled by the story card).
      if (e.key === 'Escape' && !e.defaultPrevented && !useStory.getState().active)
        focusTarget(overall.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tab, overall])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* Below xl the legend sits under the canvas instead of over the heart. */}
      <div
        className={cn(
          // Below xl the toolbar row (top-11) and the legend sit outside the canvas. Phones leave a
          // right-hand strip that is not the canvas, so a finger there still scrolls the page.
          'absolute top-0 left-0 right-0 max-md:right-3 max-xl:top-11',
          // The story card sits under the heart (also on wide screens, where the legend normally overlays it).
          storyActive ? 'bottom-80 xl:bottom-60' : 'bottom-28 md:bottom-44 xl:bottom-0',
        )}
      >
        <Canvas
          flat
          frameloop={rendering ? 'demand' : 'never'}
          dpr={[Math.min(1, maxDpr), maxDpr]}
          shadows={false}
          camera={{ fov: 35, near: 0.05, far: 60, position: [0, 1.4, 4.2] }}
          gl={{ antialias: !SOFTWARE_GL, powerPreference: 'low-power' }}
          // Empty space (not a drag) -> overall target + default view.
          // Touch taps that land within ~24 px of a vessel select it; anything else resets.
          onPointerMissed={(e) => {
            if (!isClick()) return
            const touch = isTouchLike(e as { pointerType?: string })
            const id = (touch ? pick.current(e.clientX, e.clientY) : null) ?? overall?.id
            if (id) {
              focusTarget(id)
              track('target_selected', { target: id, source: '3d' })
            }
          }}
        >
          <Suspense fallback={null}>
            <Scene
              targets={targets}
              probabilities={probabilities}
              isClick={isClick}
              registry={registry}
              pick={pick}
              onDecline={onDecline}
            />
            <OrientationSync container={containerRef} />
            <ResumeFrame rendering={rendering} />
            <ReadySignal
              container={containerRef}
              hasPrediction={Object.keys(probabilities).length > 0}
            />
          </Suspense>
        </Canvas>
        <LabelChips targets={targets} probabilities={probabilities} registry={registry} />
        <HoverTooltip targets={targets} probabilities={probabilities} ranges={ranges} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 max-md:p-2">
        <div className="pointer-events-auto flex items-start justify-between gap-2 max-xl:h-11 max-xl:items-center">
          <Toolbar overallId={overall?.id ?? null} />
          <OrientationMarker />
        </div>
        <SupplyCaption vessel={supplyVessel} />
        <div className="pointer-events-auto space-y-2">
          <StoryPlayer />
          <Legend
            targets={targets}
            probabilities={probabilities}
            thresholds={thresholds}
            compact={storyActive}
            note={supplyVessel ? `Shaded: area the ${supplyVessel.id} supplies` : undefined}
          />
        </div>
      </div>
      <ModelProgress />
    </div>
  )
}
