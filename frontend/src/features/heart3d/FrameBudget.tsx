import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

const SAMPLES = 30
const IDLE_GAP_S = 1 // longer gaps are idle time under frameloop="demand", not frame cost
const DECLINE_BELOW_FPS = 25
const INCLINE_ABOVE_FPS = 50

interface Props {
  onDecline: () => void
  onIncline: () => void
}

/**
 * PerformanceMonitor equivalent that is correct under frameloop="demand". drei's monitor counts
 * frames per wall-clock window, so the idle gaps between interactions read as a few-fps GPU and
 * trigger false declines. This one takes the median of recent frame deltas and ignores idle gaps.
 */
export function FrameBudget({ onDecline, onIncline }: Props) {
  const deltas = useRef<number[]>([])
  useFrame((_, delta) => {
    if (delta <= 0 || delta > IDLE_GAP_S) return
    const buf = deltas.current
    buf.push(delta)
    if (buf.length < SAMPLES) return
    const median = [...buf].sort((a, b) => a - b)[SAMPLES >> 1]
    buf.length = 0
    if (median > 1 / DECLINE_BELOW_FPS) onDecline()
    else if (median < 1 / INCLINE_ABOVE_FPS) onIncline()
  })
  return null
}
