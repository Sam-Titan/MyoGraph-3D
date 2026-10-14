import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { cn } from '@/lib/utils'
import { BreakdownTable } from './BreakdownTable'
import { DisagreementNote, targetsDisagree } from './DisagreementNote'
import { Headline } from './Headline'
import { SummaryPanel } from './SummaryPanel'
import { useResults } from './useResults'
import { VesselTable } from './VesselTable'
import { WhyPanel } from './WhyPanel'

/** SPEC 6.2 predictions column: cards, disagreement note, WHY bars, physiological breakdown. */
export function ResultsPanel() {
  const { features, predict, selected, setSelected, truth, presetEdited, overall, vessels } =
    useResults()
  const stale = predict.isFetching || predict.isPlaceholderData
  const data = predict.data

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
              {overall && (
                <Headline
                  target={overall}
                  prediction={data?.targets[overall.id]}
                  selected={overall.id === selected}
                  onSelect={() => setSelected(overall.id)}
                />
              )}
              <VesselTable
                vessels={vessels}
                predictions={data?.targets}
                truth={truth}
                selected={selected}
                onSelect={setSelected}
              />
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
                />
                <BreakdownTable rows={data.breakdown} groups={f.groups} target={selectedTarget} />
              </div>
            )}
            <SummaryPanel />
          </div>
        )
      }}
    </QueryBoundary>
  )
}
