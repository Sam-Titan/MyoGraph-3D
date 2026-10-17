import { useMetrics } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { CalibrationChart } from './CalibrationChart'
import { ConfusionTiles } from './ConfusionTiles'
import { HeadlineStrip } from './HeadlineStrip'
import { ImportanceChart } from './ImportanceChart'
import { MetricTable } from './MetricTable'
import { ProtocolBox } from './ProtocolBox'
import { RangeSection } from './RangeSection'
import { RocChart } from './RocChart'
import { StabilityPlot } from './StabilityPlot'

/** SPEC 6.4: everything here is derived from /api/metrics. */
export function PerformancePanel() {
  const metrics = useMetrics()

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-4 p-(--gutter)">
      <h2 className="text-xl font-semibold tracking-tight">Model performance</h2>
      <QueryBoundary query={metrics} what="metrics">
        {(m) => (
          <>
            <HeadlineStrip metrics={m} />
            <ProtocolBox metrics={m} />
            <MetricTable metrics={m} />
            <StabilityPlot metrics={m} />
            <RangeSection metrics={m} />
            <div className="grid min-w-0 grid-cols-1 gap-4 items-start xl:grid-cols-2">
              <RocChart metrics={m} />
              <CalibrationChart metrics={m} />
            </div>
            <ConfusionTiles metrics={m} />
            <ImportanceChart metrics={m} />
          </>
        )}
      </QueryBoundary>
    </div>
  )
}
