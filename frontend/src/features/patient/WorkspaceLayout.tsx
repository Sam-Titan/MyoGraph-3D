import { HeartViewport } from '@/features/heart3d/HeartViewport'
import { Panel } from '@/features/layout/Panel'
import { PatientPanel } from '@/features/patient/PatientPanel'
import { ResultsPanel } from '@/features/results/ResultsPanel'

/** SPEC 6.1 three-column workspace; stacks below 1280px. Columns scroll independently. */
export function WorkspaceLayout() {
  return (
    <div className="grid h-full grid-cols-1 gap-(--panel-gap) overflow-y-auto p-(--gutter) xl:grid-cols-[var(--col-left)_minmax(0,1fr)_var(--col-right)] xl:overflow-hidden">
      <Panel title="Patient" className="min-h-96">
        <PatientPanel />
      </Panel>
      <section
        aria-label="3D heart"
        className="viewport-surface relative min-h-96 overflow-hidden rounded-xl border border-white/10"
      >
        <HeartViewport />
      </section>
      <Panel title="Predictions" className="min-h-96">
        <ResultsPanel />
      </Panel>
    </div>
  )
}
