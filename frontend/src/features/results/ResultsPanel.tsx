import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { cn } from '@/lib/utils'
import { BreakdownTable } from './BreakdownTable'
import { DisagreementNote, targetsDisagree } from './DisagreementNote'
import { SummaryPanel } from './SummaryPanel'
import { TargetCard } from './TargetCard'
import { useResults } from './useResults'
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
        const card = (t: (typeof f.targets)[number], prominent = false) => (
          <TargetCard
            key={t.id}
            target={t}
            prediction={data?.targets[t.id]}
            actual={truth?.[t.id]}
            selected={t.id === selected}
            prominent={prominent}
            onSelect={() => setSelected(t.id)}
          />
        )
        return (
          <div className="space-y-4">
            <div className={cn('space-y-2 transition-opacity', stale && 'opacity-60')}>
              {overall && card(overall, true)}
              {vessels.map((t) => card(t))}
              {presetEdited && (
                <p className="text-xs text-muted-foreground">
                  Patient edited since the preset loaded, so its actual findings no longer apply.
                </p>
              )}
            </div>
            {disagree && <DisagreementNote />}
            <SummaryPanel />
            {predict.isError && (
              <p role="alert" className="text-xs text-destructive">
                Couldn’t get a prediction for these values.
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
              <div className={cn('space-y-4 transition-opacity', stale && 'opacity-60')}>
                <WhyPanel
                  target={selectedTarget}
                  explanation={data.explanations[selectedTarget.id]}
                  probability={data.targets[selectedTarget.id].probability}
                />
                <BreakdownTable rows={data.breakdown} groups={f.groups} target={selectedTarget} />
              </div>
            )}
          </div>
        )
      }}
    </QueryBoundary>
  )
}
