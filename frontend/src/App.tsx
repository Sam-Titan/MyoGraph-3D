import { AppShell } from '@/features/layout/AppShell'
import { EstimateAnnouncer } from '@/features/results/EstimateAnnouncer'
import { PrintSummary } from '@/features/results/PrintSummary'

export default function App() {
  return (
    <>
      <AppShell />
      <EstimateAnnouncer />
      <PrintSummary />
    </>
  )
}
