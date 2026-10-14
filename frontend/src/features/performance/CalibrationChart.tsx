import { useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { MetricsResponse } from '@/api/client'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { fixed } from '@/lib/format'
import { calibrationPoints, targetColor, targetIds } from './performanceModel'
import { Section } from './Section'
import { TargetPicker } from './TargetPicker'

const tick = (v: number) => fixed(v, 1)

export function CalibrationChart({ metrics }: { metrics: MetricsResponse }) {
  const ids = targetIds(metrics)
  const [id, setId] = useState(ids[0] ?? '')
  const t = metrics.targets[id]
  if (!t) return null
  const points = calibrationPoints(t)
  const color = targetColor(Math.max(0, ids.indexOf(id)))
  const config: ChartConfig = {
    observed: { label: 'Observed frequency', color },
    ideal: { label: 'Perfectly calibrated', color: 'var(--muted-foreground)' },
  }
  const sizes = points.map((p) => p.n)

  return (
    <Section
      title="Calibration, out-of-fold on training set"
      caption={`Points on the dashed line mean the estimated probability matches how often stenosis was actually present; each point is a bin of ${Math.min(...sizes)}–${Math.max(...sizes)} patients.`}
      aside={
        <TargetPicker
          name="Calibration"
          value={id}
          onChange={setId}
          options={ids.map((k, i) => ({
            id: k,
            label: metrics.targets[k].label,
            color: targetColor(i),
          }))}
        />
      }
    >
      <ChartContainer
        config={config}
        className="mx-auto aspect-[4/3] w-full max-w-xl xl:max-w-none"
      >
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="predicted"
            domain={[0, 1]}
            tickFormatter={tick}
            label={{ value: 'Predicted probability', position: 'insideBottom', offset: -12 }}
          />
          <YAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={tick}
            label={{ value: 'Observed frequency', angle: -90, position: 'insideLeft' }}
          />
          <Line
            dataKey="ideal"
            stroke="var(--color-ideal)"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="observed"
            stroke="var(--color-observed)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </Section>
  )
}
