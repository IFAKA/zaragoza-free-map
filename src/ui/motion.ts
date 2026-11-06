/**
 * The ONE place for the app's motion: every duration, curve, spring and variant. See docs/motion.md.
 * Character: calm, quick, physical, "at hand" (a sheet of paper slid by a thumb): short travel, soft landing, no bounce, no overshoot.
 * Components import from here. They never write a duration or a curve themselves (src/ui/motion.test.ts checks it).
 * CSS cannot import this file, so styles.css repeats MS and EASE as variables; the same test checks they agree.
 */
import type { Transition, Variants } from 'motion/react'

/** Durations in milliseconds. */
export const MS = {
  /** Press feedback (scale .97) and colour changes on controls. */
  press: 120,
  /** The old page fading out in a page turn, before the new one fades in (--dur-small). */
  pageOut: 80,
  /** A small change in place: a page fading in, a switch, a card swapping. */
  small: 150,
  /** The card of the nearest place swapping for another. */
  card: 120,
  /** A full view sliding in (Settings). */
  slide: 260,
  /** The "you picked this place" moment on the map. */
  pick: 300,
  /** The map flying to a place (Leaflet's own animation, in ms). */
  fly: 450,
  /** The map sliding to keep the place above the sheet while the sheet changes height (the sheet's own move is 300 ms). */
  reframe: 300,
} as const
const s = (ms: number) => ms / 1000

/** The single ease-out curve (the same as --ease-out in styles.css). */
export const EASE = [0.23, 1, 0.32, 1] as const
/** Short travel in px. */
export const TRAVEL = { card: 6 } as const
/** Press feedback: a press shrinks the control to 97%. */
export const PRESS_SCALE = 0.97
/** Map marker you picked: grows to 115% once, with a soft ring that fades. */
export const PICK = { scale: 1.15 } as const

const tween = (ms: number): Transition => ({ duration: s(ms), ease: EASE })
export const T = { press: tween(MS.press), small: tween(MS.small), card: tween(MS.card), slide: tween(MS.slide) } as const

/** whileTap for any pressable control. Pair it with no CSS scale on the same element. */
export const tap = { whileTap: { scale: PRESS_SCALE }, transition: T.press } as const

/** A full view (Settings and the pages inside it) comes from the right edge, where its button is. Reduced motion: a fade only. */
export const viewVariants = (reduced: boolean): Variants => (reduced
  ? { out: { opacity: 0, transition: T.small }, in: { opacity: 1, transition: T.small } }
  : { out: { x: '100%', transition: T.slide }, in: { x: 0, transition: T.slide } })

/** The nearest-place card swapping for another: a quick fade and 6 px up. Never on a live refresh of the same place. */
export const cardSwap = {
  initial: { opacity: 0, y: TRAVEL.card },
  animate: { opacity: 1, y: 0 },
  transition: T.card,
} as const

/**
 * The 2x2 button of the home header: its three icons (the fourth cell is a fixed plus) swap one at a time (an icon fades out 6 px up, the next fades in from 6 px below)
 * through the other services, once each time a service opens, then settle on the person's own three. Reduced motion: no teaser.
 */
export const slotSwap = {
  initial: { opacity: 0, y: TRAVEL.card },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -TRAVEL.card },
  transition: T.small,
} as const
/** Pause between two swaps of the teaser, in ms (a pause, not the length of an animation). */
export const TEASER_EVERY = 1500
