import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { TargetInfo } from '@/api/client'
import type { components } from '@/api/schema'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { pct, signed } from '@/lib/format'
import { useElementWidth } from './useElementWidth'
import { type WhyRow, whyRows } from './whyModel'

type Explanation = components['schemas']['TargetExplanation']

const ROW_PX = 28
/** Fixed Y-axis share of the chart; longer labels are truncated (full text is in the tooltip). */
const AXIS_SHARE = 0.45
const TICK_PX = 11
/** Rough average glyph width at TICK_PX, used to truncate labels to the axis width. */
const CHAR_PX = 6.1

const config = {
  up: { label: 'Raises the estimate', color: 'var(--contrib-up)' },
  down: { label: 'Lowers the estimate', color: 'var(--contrib-down)' },
} satisfies ChartConfig

const truncate = (s: string, maxChars: number): string =>
  s.length > maxChars ? `${s.slice(0, Math.max(1, maxChars - 1))}…` : s

function AxisTick({
  x = 0,
  y = 0,
  payload,
  maxChars,
}: {
  x?: number | string
  y?: number | string
  payload?: { value: string | number }
  maxChars: number
}) {
  const text = String(payload?.value ?? '')
  return (
    <text
      x={Number(x) - 4}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={TICK_PX}
      className="fill-foreground"
    >
      <title>{text}</title>
      {truncate(text, maxChars)}
    </text>
  )
}

function WhyTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: WhyRow }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="max-w-64 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{row.label}</p>
      {row.displayValue !== null && <p className="text-muted-foreground">{row.displayValue}</p>}
      <p className="num mt-0.5">
        {signed(row.logit)} log-odds · {row.logit >= 0 ? 'raises' : 'lowers'} the estimate
      </p>
    </div>
  )
}

interface Props {
  target: TargetInfo
  explanation: Explanation
  probability: number
}

/** SPEC 6.2 WHY panel: diverging SHAP bars (log-odds) for the selected target. */
export function WhyPanel({ target, explanation, probability }: Props) {
  const rows = whyRows(explanation)
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const axisWidth = Math.round(width * AXIS_SHARE)
  const maxChars = Math.floor(axisWidth / CHAR_PX)
  const extent = Math.max(0.5, ...rows.map((r) => Math.abs(r.logit)))
  const bound = Math.ceil(extent * 1.1 * 2) / 2

  return (
    <section aria-label={`Why: ${target.id}`} className="space-y-2">
      <h3 className="label-caps">Why · {target.label}</h3>
      <p className="text-sm">
        Average patient (model baseline){' '}
        <span className="num font-semibold">{pct(explanation.base_probability)}</span>
        <span aria-hidden> → </span>
        <span className="sr-only"> to </span>
        this patient <span className="num font-semibold">{pct(probability)}</span>
      </p>
      <div ref={ref}>
        {width > 0 && (
          <ChartContainer
            config={config}
            className="aspect-auto w-full"
            style={{ height: rows.length * ROW_PX + 56 }}
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 22, left: 0 }}
              barCategoryGap={5}
              accessibilityLayer
            >
              <XAxis
                type="number"
                domain={[-bound, bound]}
                tickCount={5}
                tickFormatter={(v: number) => (v === 0 ? '0' : signed(v))}
                tick={{ fontSize: 10 }}
                label={{
                  value: 'contribution (log-odds)',
                  position: 'insideBottom',
                  offset: -14,
                  fontSize: 10,
                }}
              />
              <YAxis
                type="category"
                dataKey="axis"
                width={axisWidth}
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={(p) => <AxisTick {...p} maxChars={maxChars} />}
              />
              <ReferenceLine x={0} stroke="var(--border)" />
              <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<WhyTooltip />} />
              <Bar dataKey="logit" radius={2} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell
                    key={r.key}
                    fill={r.logit >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
                    fillOpacity={r.other ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-contrib-down" />← lowers the estimate
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-contrib-up" />
          raises the estimate →
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Bars show how much each factor pushed this estimate up or down relative to the average
        patient.
      </p>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.key}>
            {r.axis}: {signed(r.logit)} log-odds, {r.logit >= 0 ? 'raises' : 'lowers'} the estimate
          </li>
        ))}
      </ul>
    </section>
  )
}
