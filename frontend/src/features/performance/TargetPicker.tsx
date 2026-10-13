import { cn } from '@/lib/utils'

interface Props {
  options: { id: string; label: string; color: string }[]
  value: string
  onChange: (id: string) => void
  name: string
}

/** Small per-target selector (toggle buttons; the target colour is a swatch beside the label). */
export function TargetPicker({ options, value, onChange, name }: Props) {
  return (
    <fieldset aria-label={`${name} target`} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
            'hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent',
          )}
        >
          <span aria-hidden className="size-2 rounded-full" style={{ background: o.color }} />
          <span className="num font-semibold">{o.id}</span>
        </button>
      ))}
    </fieldset>
  )
}
