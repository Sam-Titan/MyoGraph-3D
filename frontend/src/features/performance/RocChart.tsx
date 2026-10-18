import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { MetricsResponse } from '@/api/client'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { fixed } from '@/lib/format'
import { rocData } from './performanceModel'
import { Section } from './Section'

const tick = (v: number) => fixed(v, 1)

export function RocChart({ metrics }: { metrics: MetricsResponse }) {
  const { points, series } = rocData(metrics)
  const config: ChartConfig = {
    chance: { label: 'Chance', color: 'var(--muted-foreground)' },
    ...Object.fromEntries(
      series.map((s) => [s.id, { label: `${s.id}, AUC ${fixed(s.auc)}`, color: s.color }]),
    ),
  }
  return (
    <Section
      title="ROC curves, hold-out"
      caption="Further towards the top-left means the model separates patients with and without stenosis better; the dashed line is chance."
    >
      <ChartContainer
        config={config}
        className="mx-auto aspect-square w-full sm:aspect-[4/3] max-w-xl xl:max-w-none"
      >
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="fpr"
            domain={[0, 1]}
            tickFormatter={tick}
            label={{ value: 'False-positive rate', position: 'insideBottom', offset: -12 }}
          />
          <YAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={tick}
            label={{ value: 'True-positive rate', angle: -90, position: 'insideLeft' }}
          />
          <Line
            dataKey="chance"
            stroke="var(--color-chance)"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              dataKey={s.id}
              stroke={`var(--color-${s.id})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </Section>
  )
}
