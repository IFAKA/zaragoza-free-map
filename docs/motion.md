# Motion in Zaragoza a mano

One file holds all of it: `src/ui/motion.ts`. Change a number there, not in a component.

## How it should feel
Calm, quick, physical, "at hand". Think of a sheet of paper that your thumb slides. It moves a short way, lands softly and stops. Nothing bounces.

## The numbers
| Name | Value | Used for |
|---|---|---|
| press | 120 ms | a button shrinks to 97% when pressed |
| small | 150 ms | a page fades in, a switch moves, Settings fades under reduced motion |
| card | 120 ms | the nearest-place card swaps for another |
| slide | 260 ms | Settings slides in from the right |
| pick | 300 ms | a ring on the marker you picked |
| ease | one ease-out curve | every timed move |

## Direction rules
- Settings (and Language, About inside it) come from the right, where their button is.
- The service chip row never animates: choosing a service only changes the colour of its chip.
- Nearest card swap: fade 120 ms and 6 px up.
- The sheet moves up and down only.
- Live data (Bizi counts, minutes) swaps at once. No fade, no slide, also under reduced motion.
- Picking a place on the map: the marker grows to 115% and a soft ring fades once (300 ms). Only when a person picks it, never on load. The ring on the selected marker pulses twice, then stops.

## Never animate
List rows, tab labels, distance text, a repeated tap on the same tab, and anything caused by the keyboard or the back gesture (except the Settings slide itself). Only `transform` and `opacity` move.

## Reduced motion
`MotionConfig reducedMotion="user"` turns movement off. Settings only fades. The marker ring and the CSS motion are off too.

## The sheet is different
The bottom sheet is dragged by the finger, so it keeps its own CSS physics (300 ms, `drawer.tsx`). The test that looks for loose numbers skips that file on purpose.

## The library
`motion` with `LazyMotion` (`domAnimation`, `strict`) and `m.*` components. Do not import `motion.div`: `strict` makes it fail. `styles.css` repeats the durations as CSS variables (`--dur-*`); `src/ui/motion.test.ts` checks both agree and that no component writes a duration or curve by hand.
