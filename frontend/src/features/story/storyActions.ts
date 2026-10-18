import { toast } from 'sonner'
import type { Story } from '@/api/client'
import { focusTarget } from '@/features/heart3d/useViewState'
import { track } from '@/lib/analytics'
import { useAppStore } from '@/store/app'
import { getPatientBridge } from './patientBridge'
import { type Snapshot, useStory } from './useStory'

function capture(): Snapshot | null {
  const bridge = getPatientBridge()
  if (!bridge) return null
  const app = useAppStore.getState()
  return {
    values: bridge.getValues(),
    presetId: app.selectedPresetId,
    edited: app.presetEdited,
    selected: app.selectedTarget,
    tab: app.tab,
    pinned: app.pinned,
  }
}

/** Load the story's hold-out patient into the form and start at step 1. */
export function beginStory(story: Story): void {
  const bridge = getPatientBridge()
  const values = bridge?.presetValues(story.preset)
  // Starting another story keeps the snapshot of the patient the visitor really had.
  const snapshot = useStory.getState().active?.snapshot ?? capture()
  if (!bridge || !values || !snapshot) {
    toast.error('The guided tour could not start. Reload the page and try again.', {
      id: 'story-start',
    })
    return
  }
  const app = useAppStore.getState()
  app.setTab('workspace')
  app.setPinned(null) // a story is a different patient; comparing against the pin would mislead
  bridge.reset(values)
  app.setSelectedPresetId(story.preset)
  app.setPresetEdited(false)
  useStory.getState().begin(story.id, snapshot)
  track('preset_loaded', { preset: story.preset, source: 'story' })
  track('story_started', { story: story.id })
}

/** Leave the story and put back the patient (values, preset, edited flag, selection, pin, tab) from before it. */
export function endStory(completed: boolean): void {
  const active = useStory.getState().active
  if (!active) return
  const { snapshot, id } = active
  const bridge = getPatientBridge()
  const app = useAppStore.getState()
  if (bridge) {
    const presetValues = snapshot.presetId ? bridge.presetValues(snapshot.presetId) : null
    if (presetValues && snapshot.edited) {
      bridge.reset(presetValues)
      bridge.reset(snapshot.values, true)
    } else if (presetValues) bridge.reset(presetValues)
    else bridge.reset(snapshot.values)
  }
  app.setSelectedPresetId(snapshot.presetId)
  app.setPresetEdited(snapshot.edited)
  app.setPinned(snapshot.pinned)
  app.setTab(snapshot.tab)
  if (snapshot.selected) focusTarget(snapshot.selected)
  useStory.getState().clear()
  if (completed) track('story_completed', { story: id })
}
