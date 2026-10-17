import type { TargetInfo, TargetRange } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { pct, pctRange } from '@/lib/format'
import { fillTemplate, fillText } from '@/lib/template'
import { TweenedPercent } from './TweenedPercent'

interface Props {
  target: TargetInfo
  probability: number | undefined
  range: TargetRange['interval'] | undefined
  /** Ease the number between predictions (the big headline); the panel copy stays static. */
  tween?: boolean
  /** Jargon tooltips are buttons: off where the sentence already sits inside a button. */
  glossary?: boolean
}

/** "The model estimates a 78% probability of <outcome> (range 65–87%)." from config/display.yaml. */
export function HeadlineSentence({
  target,
  probability,
  range,
  tween = false,
  glossary = true,
}: Props) {
  const { data: display } = useDisplay()
  if (!display) {
    // Wording not loaded yet (or failed): the number is still shown, never hidden.
    return (
      <>
        {pct(probability)}
        {range && ` (${pctRange(range.lo, range.hi)})`}
      </>
    )
  }
  const p = tween ? (
    <TweenedPercent value={probability} className="num" />
  ) : (
    <span className="num">{pct(probability)}</span>
  )
  const rangeText = range
    ? fillText(display.headline_range, { range: pctRange(range.lo, range.hi) })
    : ''
  return (
    <>
      {fillTemplate(display.headline, {
        p,
        outcome: glossary ? <GlossaryText text={target.outcome_phrase} /> : target.outcome_phrase,
        range: rangeText,
      })}
    </>
  )
}
