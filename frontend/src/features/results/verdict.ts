import type { TargetRange, Verdict } from '@/api/client'
import type { components } from '@/api/schema'
import { pct } from '@/lib/format'

type TargetPrediction = components['schemas']['TargetPrediction']

export const VERDICT_LABEL: Record<Verdict, string> = {
  likely: 'Likely',
  unlikely: 'Unlikely',
  uncertain: 'Uncertain',
}

/** The sentence under the headline; the threshold is that target's own, from the API. */
export function verdictSentence(range: TargetRange, prediction: TargetPrediction): string {
  const thr = pct(prediction.threshold)
  switch (range.verdict) {
    case 'likely':
      return `Likely: the whole range is at or above the ${thr} decision threshold`
    case 'unlikely':
      return `Unlikely: the whole range is below the ${thr} decision threshold`
    case 'uncertain':
      return `Uncertain: the range crosses the ${thr} decision threshold`
  }
}
