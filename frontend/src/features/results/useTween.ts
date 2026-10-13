import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/** Eases toward `value` (~400 ms); the first value and reduced-motion users get no animation. */
export function useTween(value: number | undefined, duration = 0.4): number | undefined {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  // Latest displayed value, so an interrupted tween continues from where it was.
  const current = useRef(value)

  useEffect(() => {
    if (value === undefined || reduce || current.current === undefined) {
      current.current = value
      setShown(value)
      return
    }
    const controls = animate(current.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        current.current = v
        setShown(v)
      },
    })
    return () => controls.stop()
  }, [value, reduce, duration])

  return shown
}
