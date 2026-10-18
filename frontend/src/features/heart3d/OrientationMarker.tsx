import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'

const RADIUS_PX = 15

/**
 * Inside the Canvas: writes the camera's azimuth to CSS variables on the viewport container
 * (--ant-x/--ant-y: where "Anterior" points on a top-down compass, --left-x/--left-y: patient's
 * left), so the DOM marker below rotates with the view without any React re-render.
 */
export function OrientationSync({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const el = container.current
    if (!el) return
    // Camera is at azimuth `az` from +Z (anterior) toward +X (patient's left), looking at the heart.
    const az = Math.atan2(camera.position.x, camera.position.z)
    el.style.setProperty('--ant-x', String(-Math.sin(az)))
    el.style.setProperty('--ant-y', String(Math.cos(az)))
    el.style.setProperty('--left-x', String(Math.cos(az)))
    el.style.setProperty('--left-y', String(Math.sin(az)))
  })
  return null
}

const at = (vx: string, vy: string, sign: 1 | -1) =>
  ({
    transform: `translate(calc(var(${vx}, 0) * ${sign * RADIUS_PX}px), calc(var(${vy}, 1) * ${sign * RADIUS_PX}px))`,
  }) as const

/** Tiny top-down compass: A / P / L / R of the patient as seen from the current camera. */
export function OrientationMarker() {
  const L = 'absolute top-1/2 left-1/2 -ml-1.5 -mt-2 w-3 text-center text-[10px] font-semibold'
  return (
    <div
      role="img"
      aria-label="Orientation: A anterior, P posterior, L patient's left, R patient's right"
      className="relative size-10 shrink-0 rounded-full border border-white/20 bg-slate-950/50 text-viewport-foreground"
    >
      <span className={L} style={at('--ant-x', '--ant-y', 1)}>
        A
      </span>
      <span className={`${L} text-viewport-muted`} style={at('--ant-x', '--ant-y', -1)}>
        P
      </span>
      <span className={L} style={at('--left-x', '--left-y', 1)}>
        L
      </span>
      <span className={`${L} text-viewport-muted`} style={at('--left-x', '--left-y', -1)}>
        R
      </span>
    </div>
  )
}
