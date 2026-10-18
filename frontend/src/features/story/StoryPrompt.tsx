import { useEffect } from 'react'
import { toast } from 'sonner'
import { usePresets, useStories } from '@/api/queries'
import { beginStory } from './storyActions'

const SEEN_KEY = 'myograph.story-seen'

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null
  } catch {
    return true // storage blocked: never nag
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Private mode: the offer just isn't remembered.
  }
}

/** Offers the first story once per browser ("See how it works · 1 min"); skippable, replay lives in the header. */
export function StoryPrompt() {
  const stories = useStories().data?.stories
  const first = usePresets().isSuccess ? stories?.[0] : undefined

  useEffect(() => {
    if (!first || alreadySeen()) return
    markSeen()
    toast('See how it works · 1 min', {
      id: 'story-offer',
      description: 'A short guided walk-through of a real hold-out patient.',
      duration: Number.POSITIVE_INFINITY,
      action: { label: 'Start', onClick: () => beginStory(first) },
      cancel: { label: 'Skip', onClick: () => undefined },
    })
  }, [first])

  return null
}
