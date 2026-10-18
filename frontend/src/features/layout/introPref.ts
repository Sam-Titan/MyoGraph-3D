export const INTRO_KEY = 'myograph.intro-collapsed'

/** The visitor's saved choice: true = collapsed, false = open, null = never chosen (or storage blocked). */
export function readIntroCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean | null {
  try {
    const v = storage?.getItem(INTRO_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

export function writeIntroCollapsed(storage: Pick<Storage, 'setItem'> | null, collapsed: boolean) {
  try {
    storage?.setItem(INTRO_KEY, collapsed ? '1' : '0')
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
