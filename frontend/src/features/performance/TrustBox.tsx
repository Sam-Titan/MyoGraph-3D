import type { MetricsResponse } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { fixed } from '@/lib/format'
import { totalPatients, trustRows } from '@/lib/plain'
import { fillText } from '@/lib/template'
import { Section } from './Section'

/** "How much to trust each estimate": a tier per target and how often its range crosses the cut-off. */
export function TrustBox({ metrics }: { metrics: MetricsResponse }) {
  const { data: display } = useDisplay()
  if (!display) return null
  const { trust } = display
  return (
    <Section
      title={trust.title}
      caption={fillText(trust.rule, { min_auc: fixed(trust.reliable_min_auc) })}
    >
      <ul className="space-y-1.5 text-sm" data-testid="trust-box">
        {trustRows(display, metrics).map((r) => (
          <li key={r.id} data-reliable={r.reliable}>
            <GlossaryText text={r.text} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {fillText(trust.footer, { n_total: totalPatients(metrics) })}
      </p>
    </Section>
  )
}
