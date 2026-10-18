import { safeStorage } from '@/features/layout/introPref'

export const LEGEND_KEY = 'myograph.legend-hidden'

/** The visitor's saved choice: true = hidden, false = shown, null = never chosen (or storage blocked). */
export function readLegendHidden(storage: Pick<Storage, 'getItem'> | null): boolean | null {
  try {
    const v = storage?.getItem(LEGEND_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

export function writeLegendHidden(storage: Pick<Storage, 'setItem'> | null, hidden: boolean) {
  try {
    storage?.setItem(LEGEND_KEY, hidden ? '1' : '0')
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export const initialLegendHidden = (): boolean => readLegendHidden(safeStorage()) ?? false
