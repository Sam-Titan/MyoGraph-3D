import { Loader2, Sparkles } from 'lucide-react'
import { useSummary } from '@/api/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/app'

/** SPEC 6.2: on-demand plain-language summary (template, or Groq wording when the server has a key). */
export function SummaryPanel() {
  const values = useAppStore((s) => s.predictValues)
  const selected = useAppStore((s) => s.selectedTarget)
  const { data, isFetching, isError, refetch } = useSummary(values, selected)

  return (
    <section aria-label="Plain-language summary" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label-caps">Summary</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={values === null || isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {data ? 'Summarise again' : 'Summarise'}
        </Button>
      </div>
      {values === null && (
        <p className="text-xs text-muted-foreground">Fix the highlighted inputs to summarise.</p>
      )}
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          Couldn’t get a summary for these values.
        </p>
      )}
      {data && (
        <div className="space-y-2 rounded-lg border bg-card px-3 py-2">
          <Badge variant={data.source === 'groq' ? 'default' : 'secondary'}>
            {data.source === 'groq' ? 'AI-generated wording' : 'Template summary'}
          </Badge>
          <p aria-live="polite" className="text-sm leading-relaxed">
            {data.text}
          </p>
          {data.source === 'groq' && (
            <p className="text-xs text-muted-foreground">
              Inputs are sent to Groq to word this summary.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
