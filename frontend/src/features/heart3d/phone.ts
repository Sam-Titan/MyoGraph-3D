/** Phone layout (below Tailwind `md`): the canvas is a full-width card of its own, with no overlays on it. */
export const PHONE_QUERY = '(max-width: 767px)'
export const isPhone = (): boolean => window.matchMedia(PHONE_QUERY).matches

/** Phones: a chip sits this far from the heart's edge (shorter leader line), and the camera leaves room for it. */
export const PHONE_CHIP_GAP_PX = 8
const PHONE_CHIP_WIDTH_PX = 64
const CHIP_MARGIN_PX = 4
/** Canvas width the heart must leave free for one chip column on each side. */
export const PHONE_CHIP_RESERVE_PX = 2 * (PHONE_CHIP_WIDTH_PX + PHONE_CHIP_GAP_PX + CHIP_MARGIN_PX)
