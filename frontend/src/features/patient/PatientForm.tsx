import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import type { FeaturesResponse } from '@/api/client'
import { usePresets } from '@/api/queries'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { track } from '@/lib/analytics'
import { groupFeatures } from '@/lib/features'
import { useAppStore } from '@/store/app'
import { fieldErrors } from './apiErrors'
import type { DerivedState } from './DerivedField'
import { FieldRow } from './FieldRow'
import { buildFormSchema, defaultValues, type FormValues, valuesForPreset } from './formSchema'
import { LiveIndicator } from './LiveIndicator'
import { PresetSelect } from './PresetSelect'
import { rangeStatus } from './RangeBadge'
import { useLivePredict } from './useLivePredict'

function GroupCounts({ outside, edited }: { outside: number; edited: number }) {
  const parts = [
    outside > 0 ? `${outside} outside range` : null,
    edited > 0 ? `${edited} edited` : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return null
  return <span className="t-meta ml-2 font-normal">{parts.join(', ')}</span>
}

export function PatientForm({ data }: { data: FeaturesResponse }) {
  const schema = useMemo(() => buildFormSchema(data.features), [data.features])
  const groups = useMemo(() => groupFeatures(data.features, data.groups), [data])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: useMemo(() => defaultValues(data.features), [data.features]),
  })

  const values = form.watch()
  const live = useLivePredict(values, schema)
  const setEdited = useAppStore((s) => s.setPresetEdited)
  const hasPreset = useAppStore((s) => s.selectedPresetId !== null)
  const { isDirty } = form.formState
  const { setError } = form

  useEffect(() => setEdited(hasPreset && isDirty), [hasPreset, isDirty, setEdited])

  // Once per session; the event carries no field or value.
  useEffect(() => {
    if (isDirty) track('form_edited')
  }, [isDirty])

  // Server-side rejections (shouldn't happen if zod mirrors the bounds) land inline on the field.
  useEffect(() => {
    for (const [id, message] of Object.entries(fieldErrors(live.query.error))) {
      setError(id, { type: 'server', message })
    }
  }, [live.query.error, setError])

  const rows = useMemo(
    () => (live.query.data ? new Map(live.query.data.breakdown.map((r) => [r.id, r])) : null),
    [live.query.data],
  )
  const derived: DerivedState = { rows, valid: live.valid, dimmed: live.stale }

  // Per-group counts for the accordion headers: values outside reference range, and values changed
  // from the loaded preset.
  const presets = usePresets().data
  const presetId = useAppStore((s) => s.selectedPresetId)
  const presetValues = useMemo(() => {
    const preset = presets?.find((p) => p.id === presetId)
    return preset ? valuesForPreset(preset, data.features) : null
  }, [presets, presetId, data.features])
  const counts = new Map(
    groups.map(({ group, inputs, derived: computed }) => {
      let outside = 0
      let edited = 0
      for (const f of inputs) {
        const v = values[f.id]
        if (f.kind === 'number' && f.reference && typeof v === 'number' && Number.isFinite(v)) {
          if (rangeStatus(v, f.reference) !== 'normal') outside += 1
        }
        if (presetValues && v !== undefined && v !== presetValues[f.id]) edited += 1
      }
      for (const f of computed) {
        const status = rows?.get(f.id)?.status
        if (status === 'low' || status === 'high') outside += 1
      }
      return [group.id, { outside, edited }] as const
    }),
  )

  return (
    <FormProvider {...form}>
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <PresetSelect features={data.features} />
        <LiveIndicator state={live.state} />
        <Accordion multiple defaultValue={groups.slice(0, 1).map((g) => g.group.id)}>
          {groups.map(({ group, inputs, derived: computed }) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger>
                <span>
                  {group.label}
                  <GroupCounts {...(counts.get(group.id) ?? { outside: 0, edited: 0 })} />
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {[...inputs, ...computed].map((f) => (
                  <FieldRow key={f.id} feature={f} derived={derived} />
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </form>
    </FormProvider>
  )
}
