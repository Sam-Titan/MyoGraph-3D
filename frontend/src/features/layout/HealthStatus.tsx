import { useHealth } from '@/api/queries'

export function HealthStatus() {
  const { data, isPending, isError } = useHealth()

  if (isPending) return <p className="text-sm text-zinc-500">API: checking…</p>
  if (isError) return <p className="text-sm text-red-600">API: unreachable</p>
  return (
    <p className="text-sm text-zinc-600">
      API: {data.status} · model version: {data.model_version}
    </p>
  )
}
