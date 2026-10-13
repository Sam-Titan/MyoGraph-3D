import { lazy, Suspense } from 'react'
import { useFeatures } from '@/api/queries'

// three/R3F stay out of the initial bundle: they load when the workspace first renders.
const HeartScene = lazy(() => import('./HeartScene'))

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}
const HAS_WEBGL = webglAvailable()

const Message = ({ children }: { children: string }) => (
  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-viewport-muted">
    {children}
  </div>
)

/** SPEC 6.3 viewport: dark navy surface (from the parent), R3F scene + toolbar/legend overlays. */
export function HeartViewport() {
  const features = useFeatures()
  if (!HAS_WEBGL) return <Message>WebGL isn’t available, so the 3D heart can’t be shown.</Message>
  if (features.isError) return <Message>Couldn’t load the model targets for the 3D view.</Message>
  if (!features.data) return <Message>Loading…</Message>
  return (
    <div className="relative h-full w-full">
      <Suspense fallback={<Message>Loading 3D view…</Message>}>
        <HeartScene targets={features.data.targets} />
      </Suspense>
    </div>
  )
}
