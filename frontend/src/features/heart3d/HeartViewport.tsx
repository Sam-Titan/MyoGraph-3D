import { lazy, Suspense, useEffect, useState } from 'react'
import type { TargetInfo } from '@/api/client'
import { useFeatures, usePredict } from '@/api/queries'
import { useServerWake } from '@/features/layout/useServerWake'
import { WAKE_TEXT } from '@/lib/wake'
import { useAppStore } from '@/store/app'
import { PROBE } from './webgl'

// three/R3F stay out of the initial bundle: they load once the first results have painted.
const HeartScene = lazy(() => import('./HeartScene'))

/** Longest the heart waits for the first estimate before loading anyway (a sleeping server must not hold it back). */
const HEART_START_CAP_MS = 2500

const HAS_WEBGL = PROBE.available
const NO_TARGETS: TargetInfo[] = []

const Message = ({ children }: { children: string }) => (
  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-viewport-muted">
    {children}
  </div>
)

/**
 * True once the first estimate is on screen (or the cap passed). Evaluating three.js is the
 * heaviest task of the page load: doing it after the headline has painted keeps the numbers
 * and the skeleton first on slow phones.
 */
function useHeartStart(): boolean {
  const values = useAppStore((s) => s.predictValues)
  const hasEstimate = usePredict(values).data !== undefined
  const [capped, setCapped] = useState(false)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setCapped(true), HEART_START_CAP_MS)
    return () => window.clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!hasEstimate) return
    const id = window.setTimeout(() => setSettled(true), 150) // let the estimate paint first
    return () => window.clearTimeout(id)
  }, [hasEstimate])
  return capped || settled
}

/** Caption over the neutral heart while the API sleeps: a grey heart is never shown without saying why. */
function WakeNotice() {
  const phase = useServerWake()
  if (phase === 'ready') return null
  const text =
    phase === 'waking' || phase === 'slow'
      ? WAKE_TEXT[phase]
      : phase === 'failed'
        ? 'The prediction server did not answer.'
        : 'Connecting…'
  return (
    <p
      data-testid="wake-notice"
      className="pointer-events-none absolute inset-x-0 bottom-1/3 z-10 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-black/55 px-3 py-1.5 text-center text-xs text-white"
    >
      {text}
    </p>
  )
}

/**
 * SPEC 6.3 viewport: dark navy surface (from the parent), R3F scene + toolbar/legend overlays.
 * The heart shows at once, in neutral grey, even before /api/features answers: targets (and with
 * them the risk colours) join when the server is awake.
 */
export function HeartViewport() {
  const features = useFeatures()
  const start = useHeartStart()
  if (!HAS_WEBGL) return <Message>WebGL isn’t available, so the 3D heart can’t be shown.</Message>
  if (features.isError && !features.data)
    return <Message>Couldn’t load the model targets for the 3D view.</Message>
  return (
    <div className="relative h-full w-full">
      {start ? (
        <Suspense fallback={<Message>Loading 3D view…</Message>}>
          <HeartScene targets={features.data?.targets ?? NO_TARGETS} />
        </Suspense>
      ) : (
        <Message>Loading 3D view…</Message>
      )}
      {!features.data && <WakeNotice />}
    </div>
  )
}
