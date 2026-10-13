import { useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Outline, Selection } from '@react-three/postprocessing'
import { Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { TargetInfo } from '@/api/client'
import { overallTarget } from '@/lib/features'
import { CameraRig } from './CameraRig'
import { FrameBudget } from './FrameBudget'
import { HeartModel } from './HeartModel'
import { HoverTooltip } from './HoverTooltip'
import { Labels } from './Labels'
import { Legend } from './Legend'
import { Toolbar } from './Toolbar'
import { useClickGuard } from './useClickGuard'
import { useHeartModel } from './useHeartModel'
import { type Probabilities, useProbabilities, useThresholds } from './useProbabilities'
import { focusTarget } from './useViewState'

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

interface SceneProps {
  targets: TargetInfo[]
  probabilities: Probabilities
  isClick: () => boolean
  effects: boolean
  onDecline: () => void
  onIncline: () => void
}

function Scene({ targets, probabilities, isClick, effects, onDecline, onIncline }: SceneProps) {
  const { bindings, missing } = useHeartModel(targets)

  useEffect(() => {
    for (const t of missing) {
      console.error(`heart.glb has no node "${t.node}" for target ${t.id}`)
      toast.error(`The 3D model is missing the mesh for ${t.id}.`, { id: `missing-${t.node}` })
    }
  }, [missing])

  return (
    <Selection>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      <directionalLight position={[-4, -1, 2]} intensity={0.6} />
      <directionalLight position={[0, 3, -4]} intensity={0.8} />
      <HeartModel bindings={bindings} probabilities={probabilities} isClick={isClick} />
      <Labels bindings={bindings} probabilities={probabilities} />
      <CameraRig bindings={bindings} />
      <FrameBudget onDecline={onDecline} onIncline={onIncline} />
      {effects && (
        <EffectComposer multisampling={0}>
          <Outline
            blur={false}
            edgeStrength={4}
            visibleEdgeColor={0xe6f4ff}
            hiddenEdgeColor={0x5b8fb0}
            pulseSpeed={0}
          />
        </EffectComposer>
      )}
    </Selection>
  )
}

/**
 * The R3F canvas + overlays. No-GPU settings (SPEC 6.3): frameloop="demand", dpr <= 1.5, no shadows,
 * flat tone mapping so scene colours match the legend. When the frame budget declines, the
 * postprocessing outline is unmounted and dpr stays at 1 (the emissive selection cue remains).
 */
export default function HeartScene({ targets }: { targets: TargetInfo[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isClick = useClickGuard(containerRef)
  const probabilities = useProbabilities()
  const thresholds = useThresholds()
  const overall = overallTarget(targets)
  const [effects, setEffects] = useState(true)
  const [maxDpr, setMaxDpr] = useState(1.5)
  const declines = useRef(0)

  const onDecline = () => {
    declines.current += 1
    setEffects(false)
    setMaxDpr(1)
  }
  // dpr is never raised again; the outline returns only if we have declined fewer than twice.
  const onIncline = () => {
    if (declines.current < 2) setEffects(true)
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, maxDpr]}
        shadows={false}
        camera={{ fov: 35, near: 0.05, far: 60, position: [0, 1.4, 4.2] }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        // Empty space (not a drag) -> overall target + default view.
        onPointerMissed={() => {
          if (isClick() && overall) focusTarget(overall.id)
        }}
      >
        <Suspense fallback={null}>
          <Scene
            targets={targets}
            probabilities={probabilities}
            isClick={isClick}
            effects={effects}
            onDecline={onDecline}
            onIncline={onIncline}
          />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3">
        <div className="pointer-events-auto self-start">
          <Toolbar overallId={overall?.id ?? null} />
        </div>
        <div className="pointer-events-auto">
          <Legend targets={targets} probabilities={probabilities} thresholds={thresholds} />
        </div>
      </div>
      <ModelProgress />
      <HoverTooltip targets={targets} probabilities={probabilities} />
    </div>
  )
}
