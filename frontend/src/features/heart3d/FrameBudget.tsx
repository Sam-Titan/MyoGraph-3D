import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

const SAMPLES = 30
const IDLE_GAP_S = 1 // longer gaps are idle time under frameloop="demand", not frame cost
const DECLINE_BELOW_FPS = 25

interface Props {
  onDecline: () => void
}

/**
 * PerformanceMonitor equivalent that is correct under frameloop="demand" (decline only: the
 * caller lowers dpr and never raises it again). drei's monitor counts frames per wall-clock window, so the idle gaps between interactions read as a few-fps GPU and
 * trigger false declines. This one takes the median of recent frame deltas and ignores idle gaps.
 */
export function FrameBudget({ onDecline }: Props) {
  const deltas = useRef<number[]>([])
  useFrame((_, delta) => {
    if (delta <= 0 || delta > IDLE_GAP_S) return
    const buf = deltas.current
    buf.push(delta)
    if (buf.length < SAMPLES) return
    const median = [...buf].sort((a, b) => a - b)[SAMPLES >> 1]
    buf.length = 0
    if (median > 1 / DECLINE_BELOW_FPS) onDecline()
  })
  return null
}
