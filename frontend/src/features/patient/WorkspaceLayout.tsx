import { HeartViewport } from '@/features/heart3d/HeartViewport'
import { Panel } from '@/features/layout/Panel'
import { PatientPanel } from '@/features/patient/PatientPanel'
import { ResultsPanel } from '@/features/results/ResultsPanel'
import { useStory } from '@/features/story/useStory'
import { cn } from '@/lib/utils'

/** SPEC 6.1 three-column workspace; stacks below 1280px (viewport, predictions, patient). Columns scroll independently. */
export function WorkspaceLayout() {
  // Below xl the story card needs room under the heart.
  const storyActive = useStory((s) => s.active !== null)
  return (
    <div className="grid h-full min-w-0 grid-cols-1 auto-rows-min gap-(--panel-gap) overflow-y-auto overflow-x-hidden p-(--gutter) xl:auto-rows-auto xl:grid-cols-[var(--col-left)_minmax(0,1fr)_var(--col-right)] xl:overflow-hidden">
      <Panel title="Patient" className="order-3 min-h-96 xl:order-none">
        <PatientPanel />
      </Panel>
      <section
        aria-label="3D heart"
        className={cn(
          'viewport-surface relative order-1 overflow-hidden rounded-xl xl:order-none xl:h-auto xl:min-h-0',
          storyActive ? 'h-160' : 'h-128',
        )}
      >
        <HeartViewport />
      </section>
      <Panel title="Model estimates" className="order-2 min-h-96 xl:order-none">
        <ResultsPanel />
      </Panel>
    </div>
  )
}
