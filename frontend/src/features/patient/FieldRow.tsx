import { Controller, useFormContext } from 'react-hook-form'
import type { FeatureInfo } from '@/api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DerivedField, type DerivedState } from './DerivedField'
import type { FormValues } from './formSchema'
import { RangeBadge, rangeStatus } from './RangeBadge'

interface Props {
  feature: FeatureInfo
  derived: DerivedState
}

export function FieldRow({ feature: f, derived }: Props) {
  const { register, control, watch, formState } = useFormContext<FormValues>()
  const id = `field-${f.id}`
  const error = formState.errors[f.id]?.message
  const invalid = Boolean(error)

  let control_: React.ReactNode
  if (f.kind === 'derived') {
    control_ = <DerivedField feature={f} state={derived} />
  } else if (f.kind === 'number') {
    const current = watch(f.id)
    const status =
      f.reference && typeof current === 'number' && Number.isFinite(current)
        ? rangeStatus(current, f.reference)
        : null
    control_ = (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={f.input?.step}
          min={f.input?.min}
          max={f.input?.max}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className="num h-8 w-28"
          {...register(f.id, { valueAsNumber: true })}
        />
        {f.unit && <span className="text-xs text-muted-foreground">{f.unit}</span>}
        <RangeBadge status={status} />
      </div>
    )
  } else if (f.kind === 'binary') {
    control_ = (
      <Controller
        control={control}
        name={f.id}
        render={({ field }) => (
          <Switch
            id={id}
            checked={field.value === 1}
            onCheckedChange={(on) => field.onChange(on ? 1 : 0)}
            aria-invalid={invalid}
          />
        )}
      />
    )
  } else {
    control_ = (
      <Controller
        control={control}
        name={f.id}
        render={({ field }) => (
          <Select
            items={f.options}
            value={String(field.value)}
            onValueChange={(v) => v !== null && field.onChange(v)}
          >
            <SelectTrigger id={id} className="w-44" aria-invalid={invalid}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5">
      <Label htmlFor={id} className="text-sm font-normal">
        {f.label}
      </Label>
      <div className="justify-self-end">{control_}</div>
      {error && (
        <p id={`${id}-err`} role="alert" className="col-span-2 text-xs text-destructive">
          {String(error)}
        </p>
      )}
    </div>
  )
}
