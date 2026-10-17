import { useProgress } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { type RefObject, Suspense, useEffect, useRef, useState } from 'react'
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
import { Toolbar } from './Toolbar'
import { useClickGuard } from './useClickGuard'
import { IS_COMPACT, useHeartModel } from './useHeartModel'
import { type Probabilities, useProbabilities, useThresholds } from './useProbabilities'
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

/** Explains the red/amber/green tint on the heart surface while a vessel is selected. */
function SupplyCaption({ targets }: { targets: TargetInfo[] }) {
  const selected = useAppStore((s) => s.selectedTarget)
  const supply = useViewState((s) => s.supply)
  const vessel = targets.find((t) => t.id === selected && t.role === 'vessel')
  if (!supply || !vessel) return null
  return (
    <p className="pointer-events-none self-start rounded bg-slate-950/60 px-2 py-1 text-xs text-viewport-muted backdrop-blur-sm">
      Shaded area: approximate region the {vessel.id} supplies
    </p>
  )
}

const DPR_STEPS = [IS_COMPACT ? 1.25 : 1.5, 1, 0.75] as const

interface SceneProps {
  targets: TargetInfo[]
  probabilities: Probabilities
  isClick: () => boolean
  registry: LabelRegistry
  onDecline: () => void
}

function Scene({ targets, probabilities, isClick, registry, onDecline }: SceneProps) {
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
      <HeartModel bindings={bindings} probabilities={probabilities} isClick={isClick} />
      <LabelSync bindings={bindings} registry={registry} />
      <CameraRig bindings={bindings} />
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
  const isClick = useClickGuard(containerRef)
  const probabilities = useProbabilities()
  const thresholds = useThresholds()
  const overall = overallTarget(targets)
  // Device-pixel-ratio ladder: each frame-budget decline steps down one rung and never back up.
  const [rung, setRung] = useState(SOFTWARE_GL ? 1 : 0)
  const maxDpr = DPR_STEPS[rung]
  const registry = useRef<LabelRegistry>(new Map()).current
  const onDecline = () => setRung((r) => Math.min(r + 1, DPR_STEPS.length - 1))
  const tab = useAppStore((s) => s.tab)
  const storyActive = useStory((s) => s.active !== null)

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
          'absolute inset-x-0 top-0',
          // The story card sits under the heart (also on wide screens, where the legend normally overlays it).
          storyActive ? 'bottom-64 xl:bottom-60' : 'bottom-44 xl:bottom-0',
        )}
      >
        <Canvas
          flat
          frameloop="demand"
          dpr={[Math.min(1, maxDpr), maxDpr]}
          shadows={false}
          camera={{ fov: 35, near: 0.05, far: 60, position: [0, 1.4, 4.2] }}
          gl={{ antialias: !SOFTWARE_GL, powerPreference: 'low-power' }}
          // Empty space (not a drag) -> overall target + default view.
          onPointerMissed={() => {
            if (isClick() && overall) {
              focusTarget(overall.id)
              track('target_selected', { target: overall.id, source: '3d' })
            }
          }}
        >
          <Suspense fallback={null}>
            <Scene
              targets={targets}
              probabilities={probabilities}
              isClick={isClick}
              registry={registry}
              onDecline={onDecline}
            />
            <OrientationSync container={containerRef} />
            <ReadySignal
              container={containerRef}
              hasPrediction={Object.keys(probabilities).length > 0}
            />
          </Suspense>
        </Canvas>
        <LabelChips targets={targets} probabilities={probabilities} registry={registry} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3">
        <div className="pointer-events-auto flex items-start justify-between gap-2">
          <Toolbar overallId={overall?.id ?? null} />
          <OrientationMarker />
        </div>
        <SupplyCaption targets={targets} />
        <div className="pointer-events-auto space-y-2">
          <StoryPlayer />
          <Legend
            targets={targets}
            probabilities={probabilities}
            thresholds={thresholds}
            compact={storyActive}
          />
        </div>
      </div>
      <ModelProgress />
      <HoverTooltip targets={targets} probabilities={probabilities} />
    </div>
  )
}
