import { useDisplay } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { BaseRateNote } from './BaseRateNote'
import { BreakdownTable } from './BreakdownTable'
import { DisagreementNote, targetsDisagree } from './DisagreementNote'
import { Headline } from './Headline'
import { PinButton } from './PinButton'
import { PrintButton } from './PrintSummary'
import { RangeNote } from './RangeNote'
import { ResultsSkeleton } from './ResultsSkeleton'
import { SummaryPanel } from './SummaryPanel'
import { usePinDeltas } from './usePinDeltas'
import { useResults } from './useResults'
import { VesselTable } from './VesselTable'
import { WhyPanel } from './WhyPanel'

/** SPEC 6.2 predictions column: cards, disagreement note, WHY bars, physiological breakdown. */
export function ResultsPanel() {
  const {
    features,
    predict,
    ranges,
    rangesStale,
    selected,
    setSelected,
    truth,
    presetEdited,
    overall,
    vessels,
  } = useResults()
  const deltas = usePinDeltas()
  const display = useDisplay()
  const selectFromList = (id: string) => {
    setSelected(id)
    track('target_selected', { target: id, source: 'list' })
  }
  const stale = predict.isFetching || predict.isPlaceholderData || rangesStale
  const data = predict.data

  // The wording (display.yaml) is part of the first screen: waiting for it avoids a reflow of the headline.
  if (features.isPending || display.isPending) return <ResultsSkeleton />
  return (
    <QueryBoundary query={features} what="targets">
      {(f) => {
        const selectedTarget = f.targets.find((t) => t.id === selected)
        const overallPositive = overall ? data?.targets[overall.id]?.positive : undefined
        const vesselPositives = vessels.flatMap((v) => {
          const positive = data?.targets[v.id]?.positive
          return positive === undefined ? [] : [positive]
        })
        const disagree =
          overallPositive !== undefined && targetsDisagree(overallPositive, vesselPositives)
        return (
          <div className="space-y-6">
            <div className={cn('space-y-4 transition-opacity', stale && 'opacity-60')}>
              <PinButton />
              {overall && (
                <Headline
                  target={overall}
                  prediction={data?.targets[overall.id]}
                  range={ranges?.[overall.id]}
                  delta={deltas[overall.id]}
                  selected={overall.id === selected}
                  onSelect={() => selectFromList(overall.id)}
                />
              )}
              <VesselTable
                vessels={vessels}
                predictions={data?.targets}
                ranges={ranges}
                deltas={deltas}
                truth={truth}
                selected={selected}
                onSelect={selectFromList}
              />
              {data && <RangeNote ranges={ranges} />}
              <BaseRateNote target={selectedTarget ?? overall} />
              {presetEdited && (
                <p className="t-meta px-3">
                  The patient was edited after the preset loaded, so the cath results no longer
                  apply.
                </p>
              )}
            </div>
            {disagree && <DisagreementNote />}
            {predict.isError && (
              <p role="alert" className="text-xs text-destructive">
                Couldn’t get an estimate. Check the highlighted patient values, or that the API is
                running.
              </p>
            )}
            {data && data.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {data && selectedTarget && data.explanations[selectedTarget.id] && (
              <div className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}>
                <WhyPanel
                  target={selectedTarget}
                  explanation={data.explanations[selectedTarget.id]}
                  probability={data.targets[selectedTarget.id].probability}
                  threshold={data.targets[selectedTarget.id].threshold}
                  range={ranges?.[selectedTarget.id]}
                />
                <BreakdownTable rows={data.breakdown} groups={f.groups} target={selectedTarget} />
              </div>
            )}
            <SummaryPanel />
            <PrintButton />
          </div>
        )
      }}
    </QueryBoundary>
  )
}
