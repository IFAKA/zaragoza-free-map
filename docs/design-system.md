# Design system

The visual style follows the public design system of the Ayuntamiento de Zaragoza. This is an independent project. It does not use the city's logo, crest or any municipal mark, and it does not claim to be official. The footer says so.

All values live in `src/styles.css` as CSS custom properties, exposed to Tailwind through `@theme`. Components use token classes (`text-brand-text`, `bg-surface`, ...). The only literal colours outside the token file are black drop shadows.

## Colour tokens

| Token | Light | Use |
|---|---|---|
| `--color-brand` | `#D92A22` | fills of primary buttons, switch on, selected chip |
| `--color-brand-pressed` | `#B51C1C` | pressed primary |
| `--color-brand-text` | `#D92A22` (dark: `#FF8279`) | red as text: titles, links, active tab |
| `--color-brand-tint` | `#FBDDE0` | selected row |
| `--color-ink` / `--color-ink-soft` | `#3C3C3B` / `#5E5E5D` | body / secondary text (soft passes 4.5:1) |
| `--color-paper` / `--color-surface` | `#FFFFFF` / `#F3F4F4` | sheet / chips, switch off |
| `--color-line`, `--color-line-strong` | `#CDCCCC`, `#939494` | separators, secondary button border |
| `--color-warning`, `--color-info`, `--color-success`, `--color-danger` | `#EF7813`, `#4B83B4`, `#198754`, `#BE4844` | status; red-ish danger is not used for text |

Rule: red appears only on interactive elements (buttons, links, tabs, switches, chips) and on titles. Status text (open, closed) uses green and amber, never red. `e2e/check.mjs` scans computed colours to enforce this.

Dark mode is automatic (`prefers-color-scheme`). Tokens are overridden so brand text becomes `#FF8279`; contrast is kept at 4.5:1 or more.

## Marker colours (layer to token)

| Layer | Token | Value | City palette family |
|---|---|---|---|
| Water | `--color-water` | `#006B87` | Gente |
| Toilets | `--color-toilet` | `#8B5400` | Turismo |
| Charge | `--color-charge` | `#8958A9` | Cultura |
| WiFi | `--color-wifi` | `#4B83B4` | info blue |
| Libraries | `--color-library` | `#006A00` | Ciudad |
| Bizi | `--color-bike` | `#485D6D` | equipment |
| Bike racks | `--color-rack` | `#6B6B00` | olive, own-bike racks (lock icon), shown under Bizi |
| Bus stops | `--color-bus` | `#3B4BA6` | indigo, bus stops (bus icon), 7.7:1 with white |
| Tram stops | `--color-tram` | `#B04A00` | burnt orange, tram stops and track (tram icon), 5.5:1 with white |
| Cercanías stations | `--color-train` | `#0F6B5A` | teal green, Renfe stations and track (train icon), 6.4:1 with white |
| Pharmacies on duty | `--color-pharmacy` | `#B3261E` | deep red, duty pharmacies (pill icon), 6.5:1 with white |
| Warm or cool indoors | `--color-shelter` | `#A3315F` | raspberry, climate shelters (thermometer icon), 6.6:1 with white |

The app icon (`public/icon.svg` and the PNGs made from it) is a white map pin with a drop on `--color-brand` red (`#D92A22`), the same red as `theme-color`.

A place that a filter makes unavailable (closed with Open now on, a Bizi station with no bike or dock) stays on the map with the dashed grey marker; tapping it shows why and the source. Filters add, remove or re-icon only the markers that changed; they never rebuild the map.

Markers are circles of 2.27em with a white Phosphor glyph. The selected marker is 3.8em with a white border. WiFi range circles (about 40 m around city buildings, about 25 m around OpenStreetMap venues) use the WiFi colour, dashed, and are labelled as an estimate.

## Type
Montserrat (titles) and Nunito Sans (everything else), both self-hosted from `@fontsource-variable/*` (precached by the service worker, no font requests). Root size 15px; sizes in em.

## Shape
Button radius 0.46em, tiles 0.467em, cards 0.26em, modal sheet 0.73em. Touch targets are at least 44px.

## Motion
- Press feedback is `tap` from `src/ui/motion.ts` (`m.button`) on every React control. The only CSS press scale left is on Leaflet's own DOM (map markers `.mk` and the zoom buttons), which the motion library cannot wrap.
The tokens and variants live in `src/ui/motion.ts` (see `docs/motion.md` for the plain-words version). Library: `motion` with `LazyMotion` (`domAnimation`, `strict`), `m.*` components, `MotionConfig reducedMotion="user"`. Only transform and opacity move. Press feedback is `whileTap` scale .97 (`tap`), not CSS `active:scale`. The Settings view slides in from the right in 260 ms; the chip row does not animate. Durations in CSS come from `--dur-*` variables that mirror `motion.ts`.
- Drawer transform and height: 450ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Overlay: `cubic-bezier(0.32, 0.72, 0, 1)`. Swipe close duration scales with swipe strength.
- Page turn inside the drawer: 200ms opacity transition (`@starting-style`), not a keyframe. List rows, tab labels and distances never animate.
- Press: `active:scale-[.97]` at 100-160ms with `--ease-out` on every tappable element (tabs, rows, chips, buttons, map markers, zoom buttons, toasts' close, info buttons, switches). Tailwind v4 scales with the CSS `scale` property, so transitions name `scale` and `translate`, not `transform`. No `transition: all`, no scaling from 0, no ease-in; UI transitions under 300ms and exits faster than enters (popover 150ms in, 100ms out; toast 250ms in, 150ms out). Retriggerable things use transitions, not keyframes. The drawer snap stays 450ms (below).
- Loading placeholders (pharmacy list, Bizi counts): a quiet grey row with the same height as a real row, no shimmer.
- `-webkit-tap-highlight-color: transparent` and `touch-action: manipulation` everywhere.
- Hover styles apply only under `(hover: hover) and (pointer: fine)` (the `hov:` variant).
- Reduced motion: opacity and colour transitions only; `scale` and `translate` are off.

## Layout
- Mobile: bottom drawer with four snap points (closed, peek, half, full), non-modal at peek and half so the map stays usable; scroll only at full.
- Desktop (900px and up): persistent 400px left panel with the same pages.
- Service chips: one row, scrolling sideways, icon plus short name, 40 px tall with a 48 px tap area. All services: Aseos, Agua, Farmacias, Refugio, Bus, Tranvía, Bizi, Cercanías, Wifi, Charge, Libraries. The order follows tap counts per service, read once when the app opens and never changing during a session. A new visitor opens on Toilets. Refugio is 3rd from 1 Nov to 31 Mar, 4th otherwise. Peek = the chip row and one card (name, distance, open or closed, one Walk button; tap the card for details). Transit cards show the next time large and a small direction switch. Everything else (also nearby, line chips, links, filters, locate, footer) is in the full-height area.
- Settings holds only Language and About. Language defaults to Spanish whatever the browser says; the user's choice is saved.
- Selecting a place (marker or row) frames the place AND the user with `fitBounds` (padding for the open sheet, max zoom 17, Leaflet's own short easing). With no user position it pans the place above the sheet.
- There is no places list. The nearest place has a full card; the next two nearest are two chips ("Also nearby") under it, and one tap on a chip or a map marker shows that place (card and map) on every layer. The marker is panned above the sheet.
- Tram and Cercanías cards say plainly what they are: the tram card has no times (a link to the tram company page), the Cercanías card shows the next 3 trains as "Horario programado (no es tiempo real)" with the date of the timetable and a Renfe link. Planned times are never shown as live.
- Bus: the line chips on the stop card (at most 2 rows, then "+N") draw that line: a brand-colour route with arrows, stop dots and the current stop highlighted, framed above the sheet (fractional zoom so a long route fills the visible map). The sheet shows "Línea N · hacia X", the next stops, "Próximos buses" and a direction toggle; the cross or Escape goes back to the nearest stop. Live arrivals cannot be read by a browser, so the app links out.
- The selected-place card shows only name, distance and walk time, one-word open status if known, and the two buttons (walk, Details). Type, source and date, hours, notes, WiFi range, report link and the rest live on the Details page.
- Details is a page inside the same drawer; Back, Escape and swipe go up a page.
- Settings, Language and About are NOT in the drawer. They are a full-screen view that slides in from the right (a 420 px panel on desktop). A close cross sits top right, where the floating Settings button was; the title is on the left. Language and About push inside the view with a small left chevron; the cross closes everything, the phone back gesture and Escape go up one level. Focus moves in and returns to the button; the app behind is inert and body scroll is locked.

## Interaction rules
- Every enabled control shows the pointer cursor (global rule in `src/styles.css`, base layer; Tailwind v4 resets it). Disabled controls show not-allowed.
- Every interactive element is a Base UI component through `src/ui/ui/`. External links are plain `<a href>`; Leaflet's own DOM is exempt.
- Tab bar: no chevrons, fades, nudges or scroll-snap. Each cell is at least 44px tall and fully clickable.

## Drawer behaviour
- Three levels: closed (only the tab bar, safe-area aware, map fully visible), peek, full. Peek height is measured from the content (the whole nearest card, chips and notices, plus the safe-area inset, at most 72% of the screen), not a fixed number, so Spanish text and long cards never get cut. An e2e test checks the whole card is on screen at peek for every service, in English and Spanish, at 360x740.
- Drag the handle or the header to move between levels. A fast flick moves one level. A drag ends on the nearest level.
- The settings and footer area under the card scrolls only at full. When it is at its top, a new downward touch drag lowers the sheet.
- Tap the map: the sheet lowers one level (full goes to peek). Tap a tab while closed: opens to half. Tap the active tab while open: lowers one level.
- Tap the handle: closed goes to peek, peek to full, full to peek. The handle is 96 by 28px (not 44px tall, so it does not cover the tabs).
- Choosing a marker or a chip opens the peek and pans the marker above the sheet.
- Back goes up one page. Escape goes up a page, then lowers one level. Closing returns to the home page.
- When closed, the page body is inert (not focusable, not read), so only the tabs work.
- Motion: 450ms cubic-bezier(.22,1,.36,1) on transform only; page fade 200ms. With reduced motion, opacity only.
- Mouse: a drag works only downward from the handle (Base UI limit). Clicking the handle cycles the levels.

## Honesty rules
Every record shows its source and date ("City record, 2023", "OpenStreetMap, snapshot 2026-11-02, not verified by us"). Library occupancy is a live link only for University of Zaragoza libraries; others say "Occupancy not published". Bizi shows station places only. Footer shows "Data refreshed <date>". Each place has a "Wrong or missing? Report" link (OpenStreetMap note).

## Bizi chips and location header
- Chips: "Take a bike" (default), "Return a bike", "My bike", in a fixed bar above the list so they show at peek. Below them one status line: "Live counts, updated 14:32", or a quiet placeholder while loading, or "Live counts unavailable" with a link-style Try again. The line is not shown for "My bike".
- Rows and the card show "N bikes · M free docks"; the card adds "(K electric)".
- List header: "N places", then "Distances from the city centre" with a full-width 48px Use my location button; once located "Distances from you"; if blocked one calm line, no button, no toast.
