import { Loader2, Sparkles } from 'lucide-react'
import { useSummary } from '@/api/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { useAppStore } from '@/store/app'

/** SPEC 6.2: on-demand plain-language summary (template, or Groq wording when the server has a key). */
export function SummaryPanel() {
  const values = useAppStore((s) => s.predictValues)
  const selected = useAppStore((s) => s.selectedTarget)
  const { data, isFetching, isError, refetch } = useSummary(values, selected)

  return (
    <section aria-label="Plain-language summary" className="rule-t space-y-2 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="t-section">Plain-language summary</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={values === null || isFetching}
          onClick={() => {
            track('summary_requested')
            void refetch()
          }}
        >
          {isFetching ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {data ? 'Summarise again' : 'Summarise'}
        </Button>
      </div>
      {values === null && (
        <p className="text-xs text-muted-foreground">
          Correct the highlighted patient values, then choose Summarise.
        </p>
      )}
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          Couldn’t get a summary. Choose Summarise again, or check that the API is running.
        </p>
      )}
      {data && (
        <div className="space-y-2">
          <Badge variant={data.source === 'groq' ? 'default' : 'secondary'}>
            {data.source === 'groq' ? 'AI-generated wording' : 'Template summary'}
          </Badge>
          <p aria-live="polite" className="text-sm leading-relaxed">
            {data.text}
          </p>
          {data.source === 'groq' && (
            <p className="text-xs text-muted-foreground">
              The model’s results (percentages, verdicts and the top contributing factors with their
              entered values) are sent to Groq to word this summary. Nothing else is sent.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
