import { DisclaimerBanner } from '@/features/layout/DisclaimerBanner'
import { HealthStatus } from '@/features/layout/HealthStatus'

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <DisclaimerBanner />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">CardioLens 3D</h1>
        <HealthStatus />
      </main>
    </div>
  )
}
