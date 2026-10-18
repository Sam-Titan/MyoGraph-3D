import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { HeartViewport } from '@/features/heart3d/HeartViewport'
import { Panel } from '@/features/layout/Panel'
import { ResultsPanel } from '@/features/results/ResultsPanel'
import { useStory } from '@/features/story/useStory'
import { useMediaQuery, WIDE_QUERY } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { PatientSlot, usePatientHost } from './PatientHost'

/** "Edit patient" with the form's "N edited / N outside range" summary; opens the bottom sheet. */
function EditPatientButton({ onOpen }: { onOpen: () => void }) {
  const { edited, outside } = useAppStore((s) => s.patientSummary)
  const parts = [
    edited > 0 ? `${edited} edited` : null,
    outside > 0 ? `${outside} outside range` : null,
  ].filter((p): p is string => p !== null)
  return (
    <Button
      variant="outline"
      className="h-11 min-w-0 flex-1 justify-start gap-2 px-3 text-left"
      onClick={onOpen}
    >
      <Pencil />
      <span className="min-w-0">
        <span className="block leading-tight">Edit patient</span>
        <span
          className="t-meta block truncate leading-tight font-normal"
          data-testid="patient-summary"
        >
          {parts.length > 0 ? parts.join(', ') : 'No edits'}
        </span>
      </span>
    </Button>
  )
}

/**
 * SPEC 6.1 workspace. Wide (>= 1280px): three columns (patient, viewport, predictions), each
 * scrolling on its own. Narrower: the heart is sticky on top (collapsible on phones, a left column
 * from `md`), the predictions follow in one page scroll and the patient form lives in a bottom
 * sheet behind the "Edit patient" button. Landscape phones (`short`) scroll the heart normally.
 */
export function WorkspaceLayout() {
  const storyActive = useStory((s) => s.active !== null)
  const wide = useMediaQuery(WIDE_QUERY)
  const { host, portal } = usePatientHost()
  const [collapsed, setCollapsed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Leaving the narrow layout closes the sheet so it never reopens by itself on the way back.
  useEffect(() => {
    if (wide) setSheetOpen(false)
  }, [wide])
  // A story needs the heart, so it expands it again.
  const folded = collapsed && !storyActive
  return (
    <div className="grid h-full min-w-0 grid-cols-1 auto-rows-min gap-(--panel-gap) overflow-y-auto overflow-x-hidden p-(--gutter) md:max-xl:grid-cols-2 xl:auto-rows-auto xl:grid-cols-[var(--col-left)_minmax(0,1fr)_var(--col-right)] xl:overflow-hidden">
      {portal}
      {wide && (
        <Panel title="Patient">
          <PatientSlot host={host} />
        </Panel>
      )}
      <div className="sticky top-0 z-30 order-1 max-md:-mx-(--gutter) max-md:bg-background max-md:px-(--gutter) md:max-xl:col-start-1 md:max-xl:row-start-1 md:max-xl:self-start short:static xl:contents">
        <div className="flex h-14 items-center gap-2 py-1.5 xl:hidden">
          <EditPatientButton onOpen={() => setSheetOpen(true)} />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 pointer-coarse:h-11 md:hidden"
            aria-expanded={!folded}
            aria-controls="heart-section"
            onClick={() => setCollapsed((c) => !c)}
          >
            {folded ? <ChevronDown /> : <ChevronUp />}
            {folded ? 'Show heart' : 'Hide heart'}
          </Button>
        </div>
        <section
          id="heart-section"
          aria-label="3D heart"
          className={cn(
            'viewport-surface relative overflow-hidden rounded-xl xl:h-auto xl:min-h-0',
            // 14rem = banner, header, bottom nav, gutter and the Edit-patient bar around the heart.
            storyActive
              ? 'h-[calc(100dvh-14rem)]'
              : 'h-[calc(46dvh-3.5rem)] md:h-[calc(100dvh-14rem)]',
            'short:h-[30rem]',
            folded && 'max-md:hidden',
          )}
        >
          <HeartViewport />
        </section>
      </div>
      <Panel title="Model estimates" className="order-3 md:max-xl:col-start-2 xl:order-none">
        <ResultsPanel />
      </Panel>
      <Sheet open={sheetOpen && !wide} onOpenChange={setSheetOpen}>
        <SheetContent title="Patient">
          <PatientSlot host={host} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
