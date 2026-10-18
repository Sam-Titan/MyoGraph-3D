import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useFeatures,
  useIntervals,
  useMetrics,
  usePredict,
  usePresets,
  useStories,
} from '@/api/queries'
import { Button } from '@/components/ui/button'
import { focusTarget } from '@/features/heart3d/useViewState'
import { cn } from '@/lib/utils'
import { endStory } from './storyActions'
import { highlightedFactors, renderStep, type StoryContext } from './storyText'
import { useStory } from './useStory'

/** How long a story waits for its ranges before playing without them. */
const RANGES_GRACE_MS = 1500

/**
 * The story card: Back / Next / Exit, arrow keys and Esc. Each step flies the camera to its target
 * (an instant cut under reduced motion), points at the top factors in the results panel, and from
 * the reveal step on shows the real result. Text is filled from the story's own prediction of the
 * hold-out preset, so every number comes from the API.
 */
export function StoryPlayer() {
  const active = useStory((s) => s.active)
  const storiesData = useStories().data
  const stories = storiesData?.stories
  const split = useMetrics().data?.split
  const story = stories?.find((s) => s.id === active?.id)
  const preset = usePresets().data?.find((p) => p.id === story?.preset)
  const targets = useFeatures().data?.targets
  const predict = usePredict(preset?.values ?? null)
  const intervals = useIntervals(preset?.values ?? null)
  const next = useRef<HTMLButtonElement>(null)

  // Ranges are a bonus: if they fail or are slow, the story plays without its range sentences.
  const [rangesWaited, setRangesWaited] = useState(false)
  const presetId = preset?.id
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the wait when the story's patient changes
  useEffect(() => {
    setRangesWaited(false)
    const id = setTimeout(() => setRangesWaited(true), RANGES_GRACE_MS)
    return () => clearTimeout(id)
  }, [presetId])
  const rangesReady = Boolean(intervals.data) && !intervals.isPlaceholderData
  const noRanges = !rangesReady && (intervals.isError || rangesWaited)

  const index = active?.step ?? 0
  const step = story?.steps[index]
  const last = story ? index === story.steps.length - 1 : false

  const ctx: StoryContext | null = useMemo(
    () =>
      predict.data &&
      !predict.isPlaceholderData &&
      (rangesReady || noRanges) &&
      targets &&
      preset &&
      storiesData &&
      split
        ? {
            targets,
            response: predict.data,
            ranges: rangesReady && intervals.data ? intervals.data.targets : {},
            truth: preset.truth,
            factorNote: storiesData.factor_note,
            patients: split.n_train + split.n_test,
          }
        : null,
    [
      predict.data,
      predict.isPlaceholderData,
      intervals.data,
      rangesReady,
      noRanges,
      targets,
      preset,
      storiesData,
      split,
    ],
  )

  const go = (to: number) => {
    if (!story || to < 0 || to >= story.steps.length) return
    useStory.getState().setStep(to)
  }
  const advance = () => (last ? endStory(true) : go(index + 1))

  // Per step: select + frame the target, and keep the real result hidden until a reveal step.
  const storyId = story?.id
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per step, not per data refresh
  useEffect(() => {
    if (!story || !step) return
    const cam = step.camera?.target ?? step.highlight?.target
    if (cam) focusTarget(cam)
    useStory.getState().setRevealed(story.steps.slice(0, index + 1).some((s) => s.reveal_truth))
  }, [storyId, index])

  // Factors named by the step, once the estimate has arrived.
  useEffect(() => {
    if (!step?.highlight || !ctx) {
      useStory.getState().setHighlight(null)
      return
    }
    useStory.getState().setHighlight({
      target: step.highlight.target,
      ids: highlightedFactors(step, ctx).map((c) => c.id),
    })
  }, [step, ctx])

  useEffect(() => {
    if (!active) return
    next.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        endStory(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        document.querySelector<HTMLButtonElement>('[data-story-next]')?.click()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        document.querySelector<HTMLButtonElement>('[data-story-back]')?.click()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])

  if (!active || !story || !step) return null
  const position = (stories?.findIndex((s) => s.id === story.id) ?? 0) + 1
  const sentences = ctx ? renderStep(step, ctx) : []

  return (
    <section
      aria-label={`Guided story: ${story.title}`}
      data-story-card={story.id}
      data-story-step={step.id}
      className="space-y-2 rounded-lg border border-white/20 bg-slate-950/90 p-3 text-viewport-foreground shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-viewport-muted">
          Story {position} of {stories?.length}: {story.title}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Exit story"
          className="-mt-1 -mr-1 text-viewport-foreground hover:bg-white/15 hover:text-white"
          onClick={() => endStory(false)}
        >
          <X />
        </Button>
      </div>
      <p aria-live="polite" data-story-text className="min-h-16 text-sm leading-snug">
        {ctx ? sentences.join(' ') : 'Loading the estimate…'}
      </p>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          data-story-back
          disabled={index === 0}
          className="border-white/20 bg-white/10 text-viewport-foreground hover:bg-white/20 hover:text-white"
          onClick={() => go(index - 1)}
        >
          Back
        </Button>
        <span aria-hidden className="flex gap-1">
          {story.steps.map((s, i) => (
            <span
              key={s.id}
              className={cn('size-1.5 rounded-full', i === index ? 'bg-white' : 'bg-white/30')}
            />
          ))}
        </span>
        <span className="sr-only">
          Step {index + 1} of {story.steps.length}
        </span>
        <Button ref={next} size="sm" data-story-next disabled={!ctx} onClick={advance}>
          {last ? 'Finish' : 'Next'}
        </Button>
      </div>
    </section>
  )
}
