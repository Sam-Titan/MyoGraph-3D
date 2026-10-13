import type { TargetInfo } from '@/api/client'
import { riskCss } from '@/lib/riskColor'
import { type Probabilities, pctLabel } from './useProbabilities'

const GRADIENT = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${riskCss(i / 10)} ${i * 10}%`).join(', ')})`

/**
 * Probability legend plus every target's number, so the % is visible even with labels toggled off.
 * Colour is never shown without a number.
 */
export function Legend({
  targets,
  probabilities,
}: {
  targets: TargetInfo[]
  probabilities: Probabilities
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/55 p-2.5 backdrop-blur-sm">
      <div>
        <div className="h-2 rounded-full" style={{ backgroundImage: GRADIENT }} aria-hidden />
        <div className="num mt-1 flex justify-between text-[11px] text-viewport-muted">
          <span>0%</span>
          <span>model estimate (calibrated probability)</span>
          <span>100%</span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {targets.map((t) => {
          const p = probabilities[t.id]
          return (
            <li key={t.id} className="flex items-center gap-1.5 text-xs text-viewport-foreground">
              <span
                aria-hidden
                className="size-2 rounded-full border border-white/30"
                style={{ background: p === undefined ? 'transparent' : riskCss(p) }}
              />
              <span className="text-viewport-muted">{t.id}</span>
              <span className="num font-medium">{pctLabel(p)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
