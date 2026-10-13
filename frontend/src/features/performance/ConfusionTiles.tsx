import type { MetricsResponse } from '@/api/client'
import { fixed, pct } from '@/lib/format'
import { confusionTiles, targetColor, targetIds } from './performanceModel'
import { Section } from './Section'

export function ConfusionTiles({ metrics }: { metrics: MetricsResponse }) {
  return (
    <Section
      title="Confusion matrices · hold-out, tuned threshold"
      caption="Each row shows what the model estimated for patients whose actual status was negative or positive; percentages are per row."
    >
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
        {targetIds(metrics).map((id, i) => {
          const t = metrics.targets[id]
          const tiles = confusionTiles(t.confusion_test.tuned)
          return (
            <li key={id} className="min-w-0 space-y-1.5">
              <p className="text-xs">
                <span
                  aria-hidden
                  className="mr-1.5 inline-block size-2 rounded-full"
                  style={{ background: targetColor(i) }}
                />
                <span className="num font-semibold">{id}</span>{' '}
                <span className="text-muted-foreground">
                  · threshold {fixed(t.threshold.tuned)}
                </span>
              </p>
              <div className="grid grid-cols-[1rem_2.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-1 text-[11px] text-muted-foreground">
                <span className="col-span-2" />
                <span className="col-span-2 text-center">Predicted</span>
                <span className="col-span-2" />
                <span className="text-center">Negative</span>
                <span className="text-center">Positive</span>
                <span className="row-span-2 flex rotate-180 items-center justify-center [writing-mode:vertical-rl]">
                  Actual
                </span>
                {[0, 1].map((row) => (
                  <div key={row} className="contents">
                    <span className="flex items-center">{row === 0 ? 'Negative' : 'Positive'}</span>
                    {tiles.slice(row * 2, row * 2 + 2).map((c) => {
                      const correct = c.actual === c.predicted
                      return (
                        <div
                          key={c.predicted}
                          className="rounded-md border px-2 py-2 text-center text-foreground"
                          style={{
                            background: `color-mix(in oklch, var(${correct ? '--primary' : '--muted-foreground'}) ${Math.round(c.rowShare * 45)}%, transparent)`,
                          }}
                        >
                          <span className="num block text-lg font-semibold">{c.count}</span>
                          <span className="num block text-xs">{pct(c.rowShare)} of row</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
