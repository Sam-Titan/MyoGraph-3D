import { useFeatures } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { PatientForm } from './PatientForm'

export function PatientPanel() {
  const features = useFeatures()
  return (
    <QueryBoundary query={features} what="input schema">
      {(data) => <PatientForm data={data} />}
    </QueryBoundary>
  )
}
