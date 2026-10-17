import { Play } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useStories } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { beginStory } from './storyActions'
import { useStory } from './useStory'

/** Header button "How it works": opens the list of stories (also the replay path after the first visit). */
export function StoryLauncher() {
  const stories = useStories().data?.stories
  const open = useStory((s) => s.menuOpen)
  const setOpen = useStory((s) => s.setMenuOpen)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  if (!stories || stories.length === 0) return null
  return (
    <div ref={root}>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls="story-menu"
        onClick={() => setOpen(!open)}
      >
        <Play />
        How it works
      </Button>
      {open && (
        <section
          id="story-menu"
          aria-label="Guided stories"
          className="absolute top-full right-(--gutter) z-50 mt-1 w-[min(24rem,calc(100%-2*var(--gutter)))] space-y-1 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <p className="px-2 pt-1 text-xs text-muted-foreground">
            Short guided walk-throughs of real hold-out patients. Your own patient is put back when
            you leave.
          </p>
          {stories.map((s) => (
            <button
              key={s.id}
              type="button"
              data-story-start={s.id}
              onClick={() => beginStory(s)}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="block text-xs text-muted-foreground">{s.blurb}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
