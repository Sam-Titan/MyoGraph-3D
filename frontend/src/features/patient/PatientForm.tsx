import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import type { FeaturesResponse } from '@/api/client'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { groupFeatures } from '@/lib/features'
import { useAppStore } from '@/store/app'
import { fieldErrors } from './apiErrors'
import type { DerivedState } from './DerivedField'
import { FieldRow } from './FieldRow'
import { buildFormSchema, defaultValues, type FormValues } from './formSchema'
import { LiveIndicator } from './LiveIndicator'
import { PresetSelect } from './PresetSelect'
import { useLivePredict } from './useLivePredict'

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

  return (
    <FormProvider {...form}>
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <PresetSelect features={data.features} />
        <LiveIndicator state={live.state} />
        <Accordion multiple defaultValue={groups.slice(0, 1).map((g) => g.group.id)}>
          {groups.map(({ group, inputs, derived: computed }) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger>{group.label}</AccordionTrigger>
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
