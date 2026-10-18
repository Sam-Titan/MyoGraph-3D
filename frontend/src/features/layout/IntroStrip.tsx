import { ChevronDown, ChevronUp, Info, Play } from 'lucide-react'
import { useState } from 'react'
import { usePresets, useStories } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { beginStory } from '@/features/story/storyActions'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { readIntroCollapsed, safeStorage, writeIntroCollapsed } from './introPref'

const STEPS = ['Pick or enter a patient', 'See the estimate per artery', 'See why']

/**
 * What this is and what to do, for someone arriving cold. Open on first visit (closed by default on
 * phones, where the heart needs the room); the choice is remembered. The disclaimer banner above
 * stays separate and always visible.
 */
export function IntroStrip() {
  const roomy = useMediaQuery('(min-width: 768px)')
  const [saved, setSaved] = useState(() => readIntroCollapsed(safeStorage()))
  const collapsed = saved ?? !roomy
  const first = useStories().data?.stories[0]
  const presetsReady = usePresets().isSuccess

  const toggle = () => {
    writeIntroCollapsed(safeStorage(), !collapsed)
    setSaved(!collapsed)
  }
  const tour =
    first && presetsReady ? (
      <Button
        variant="outline"
        size="sm"
        className="max-md:hidden"
        onClick={() => beginStory(first)}
      >
        <Play />
        Guided tour · 1 min
      </Button>
    ) : null

  return (
    <section
      aria-label="About this app"
      data-testid="intro-strip"
      className="shrink-0 border-b bg-muted/40 px-(--gutter) py-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Info aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {collapsed ? (
          <p className="min-w-0 flex-1 font-medium">What is this?</p>
        ) : (
          <div className="min-w-0 flex-1 basis-80 space-y-1">
            <p>
              A research demo that turns a patient’s clinical data into{' '}
              <strong className="font-semibold">model estimates</strong> of coronary artery
              blockage, drawn on a 3D heart. Not a diagnosis.
            </p>
            <ol className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="num font-medium text-foreground">{i + 1}.</span>
                  {s}
                  {i < STEPS.length - 1 && <span aria-hidden>→</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {tour}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show the introduction' : 'Hide the introduction'}
          className="pointer-coarse:h-11"
          onClick={toggle}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
          <span className="max-sm:sr-only">{collapsed ? 'Show' : 'Hide'}</span>
        </Button>
      </div>
    </section>
  )
}
