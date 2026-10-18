import { Printer } from 'lucide-react'
import { useDisplay, useFeatures, useHealth } from '@/api/queries'
import { Button } from '@/components/ui/button'
import {
  DISCLAIMER_BODY,
  DISCLAIMER_LEAD,
  DISCLAIMER_PRINT_EXTRA,
} from '@/features/layout/disclaimer'
import { pct, pctRange } from '@/lib/format'
import { useAppStore } from '@/store/app'
import { HeadlineSentence } from './HeadlineSentence'
import { rangeMethod } from './RangeNote'
import { useResults } from './useResults'
import { thresholdLabel } from './verdict'

const TOP_FACTORS = 5

/** "Save / print summary": the browser's print dialog (Save as PDF) shows only <PrintSummary />. */
export function PrintButton() {
  const { predict, rangesStale } = useResults()
  const valid = useAppStore((s) => s.predictValues) !== null
  // Only print numbers that describe the patient in the form right now.
  const current =
    Boolean(predict.data) &&
    valid &&
    !predict.isPlaceholderData &&
    !predict.isFetching &&
    !rangesStale
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!current}
      onClick={() => window.print()}
      className="pointer-coarse:h-11"
    >
      <Printer /> Save / print summary
    </Button>
  )
}

/**
 * One-page summary, hidden on screen and the only thing printed: estimates with ranges, the plain
 * explanation of the selected target, its top factors, the disclaimer, the model version and date.
 */
export function PrintSummary() {
  const { predict, ranges, selected, overall, vessels } = useResults()
  const { data: features } = useFeatures()
  const { data: display } = useDisplay()
  const { data: health } = useHealth()
  const data = predict.data
  const target = features?.targets.find((t) => t.id === (selected ?? overall?.id))
  const steps = (target && data?.explanations[target.id]?.waterfall) || []
  const factors = steps.filter((s) => s.feature !== null).slice(0, TOP_FACTORS)
  const firstRange = ranges ? Object.values(ranges)[0] : undefined

  return (
    <article id="print-summary" aria-hidden className="hidden text-[11pt] text-black print:block">
      <h1 className="text-2xl font-semibold">MyoGraph 3D: patient summary</h1>
      <p className="text-sm">
        {new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}
        {health && ` · model ${health.model_version}`}
      </p>
      <p className="mt-3 border border-black p-2 text-sm font-semibold">
        {DISCLAIMER_LEAD} {DISCLAIMER_BODY} {DISCLAIMER_PRINT_EXTRA}
      </p>
      {data && display && (
        <>
          <h2 className="mt-5 text-lg font-semibold">Model estimates</h2>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">Target</th>
                <th>Estimate</th>
                <th>Range</th>
                <th>Against the model’s cut-off</th>
              </tr>
            </thead>
            <tbody>
              {[...(overall ? [overall] : []), ...vessels].map((t) => {
                const p = data.targets[t.id]
                const r = ranges?.[t.id]
                return (
                  <tr key={t.id} className="border-b border-gray-400 align-top">
                    <td className="py-1">
                      <strong>{t.id}</strong> <span>{t.plain_label}</span>
                    </td>
                    <td className="num font-semibold">{pct(p?.probability)}</td>
                    <td className="num">{r ? pctRange(r.interval.lo, r.interval.hi) : '—'}</td>
                    <td>
                      {r ? thresholdLabel(r, display) : '—'}
                      {p && <span> (cut-off {pct(p.threshold)})</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs">
            {display.range_meaning}
            {firstRange && ` ${rangeMethod(firstRange.interval)}`}
          </p>
          {target && (
            <>
              <h2 className="mt-5 text-lg font-semibold">In plain words: {target.id}</h2>
              <p className="mt-1">
                <HeadlineSentence
                  target={target}
                  probability={data.targets[target.id]?.probability}
                  range={ranges?.[target.id]?.interval}
                  glossary={false}
                />
              </p>
              {factors.length > 0 && (
                <>
                  <h3 className="mt-3 font-semibold">Top factors for this estimate</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {factors.map((f) => (
                      <li key={f.feature}>
                        {f.label}: {f.value_display}. Moves the estimate{' '}
                        {f.to_p >= f.from_p ? 'up' : 'down'} by{' '}
                        <span className="num">
                          {Math.abs((f.to_p - f.from_p) * 100).toFixed(1)}
                        </span>{' '}
                        percentage points.
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">
                    Factors are listed largest first; each step depends on the order.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
    </article>
  )
}
