import type { TargetInfo, TargetRange } from '@/api/client'
import { useDisplay, useMetrics } from '@/api/queries'
import type { components } from '@/api/schema'
import { GlossaryText } from '@/components/GlossaryText'
import { useStory } from '@/features/story/useStory'
import { pct } from '@/lib/format'
import { datasetPrevalence } from '@/lib/plain'
import { fillText } from '@/lib/template'
import { DotPicture } from './DotPicture'
import { HeadlineSentence } from './HeadlineSentence'
import { LogOddsBars } from './LogOddsBars'
import { thresholdLabel } from './verdict'
import { Waterfall } from './Waterfall'

type Explanation = components['schemas']['TargetExplanation']

interface Props {
  target: TargetInfo
  explanation: Explanation
  probability: number
  threshold: number
  range: TargetRange | undefined
}

/**
 * The selected target in plain words: a sentence, the 100-dot picture (when the range is known),
 * the probability waterfall, and the log-odds (SHAP) numbers behind it under "Technical details".
 */
export function WhyPanel({ target, explanation, probability, threshold, range }: Props) {
  const { data: display } = useDisplay()
  const { data: metrics } = useMetrics()
  const hl = useStory((s) => s.highlight)
  if (!display) return null
  const marked = new Set(hl?.target === target.id ? hl.ids : [])
  const w = display.waterfall
  const logit = explanation.base_logit + explanation.contributions.reduce((s, c) => s + c.logit, 0)
  return (
    <section aria-label={`Why: ${target.id}`} className="rule-t space-y-3 pt-4">
      <h3 className="t-section">
        {fillText(w.title, { p: pct(probability) })}
        <span className="t-meta ml-2 font-normal">{target.label}</span>
      </h3>
      <p className="text-sm" data-testid="why-sentence">
        <HeadlineSentence target={target} probability={probability} range={range?.interval} />
        {range && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {thresholdLabel(range, display)}
          </span>
        )}
      </p>
      {range && (
        <DotPicture
          target={target}
          probability={probability}
          range={range.interval}
          display={display}
        />
      )}
      <Waterfall
        steps={explanation.waterfall}
        probability={probability}
        threshold={threshold}
        range={range?.interval}
        display={display}
        marked={marked}
      />
      <div className="space-y-1 text-xs text-muted-foreground">
        {metrics && (
          <p data-testid="baseline-caption">
            <GlossaryText
              text={fillText(w.baseline_caption, {
                target: target.label,
                base: pct(explanation.base_probability),
                prev: `${datasetPrevalence(metrics, target.id)} in 100`,
                outcome: target.outcome_phrase,
              })}
            />
          </p>
        )}
        <p>{w.order_caption}</p>
      </div>
      <details className="group rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium">{w.technical_title}</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            <GlossaryText
              text={fillText(w.technical_line, {
                base_logit: explanation.base_logit.toFixed(2),
                logit: logit.toFixed(2),
                p: pct(probability),
              })}
            />
          </p>
          <LogOddsBars targetId={target.id} explanation={explanation} />
        </div>
      </details>
    </section>
  )
}
