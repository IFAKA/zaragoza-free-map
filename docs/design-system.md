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

Markers are circles of 2.27em with a white Phosphor glyph. The selected marker is 3.8em with a white border. WiFi range circles (about 40 m around city buildings, about 25 m around OpenStreetMap venues) use the WiFi colour, dashed, and are labelled as an estimate.

## Type
Montserrat (titles) and Nunito Sans (everything else), both self-hosted from `@fontsource-variable/*` (precached by the service worker, no font requests). Root size 15px; sizes in em.

## Shape
Button radius 0.46em, tiles 0.467em, cards 0.26em, modal sheet 0.73em. Touch targets are at least 44px.

## Motion
- Drawer transform and height: 450ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Overlay: `cubic-bezier(0.32, 0.72, 0, 1)`. Swipe close duration scales with swipe strength.
- Page turn inside the drawer: 300ms opacity fade, keyed per turn.
- Press: `active:scale-[.97]`, 120ms. No `transition: all`: only transform, opacity and small colour changes.
- Hover styles apply only under `(hover: hover) and (pointer: fine)` (the `hov:` variant).
- Reduced motion: opacity only (no slides).

## Layout
- Mobile: bottom drawer with three snap points (peek, half, full), non-modal at peek and half so the map stays usable; scroll only at full.
- Desktop (900px and up): persistent 400px left panel with the same pages.
- Submenus (More, Language, About, Details) are pages inside the same drawer. Back, Escape and swipe go up a page.

## Honesty rules
Every record shows its source and date ("City record, 2023", "OpenStreetMap, snapshot 2026-11-02, not verified by us"). Library occupancy is a live link only for University of Zaragoza libraries; others say "Occupancy not published". Bizi shows station places only. Footer shows "Data refreshed <date>". Each place has a "Wrong or missing? Report" link (OpenStreetMap note).
