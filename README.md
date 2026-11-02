# Free services · Zaragoza

Mobile-first map of free water, toilets, phone charging, WiFi (plus libraries and Bizi) in Zaragoza. Nearest first. React 19, Vite, strict TypeScript, Tailwind v4, Base UI (`@base-ui/react`), Leaflet, vite-plugin-pwa.

## Run
    npm install
    npm run dev       # dev server
    npm test          # Vitest (UTM, opening hours, city hours, normalisers, data checks)
    npm run build     # type-check + production build in dist/ (PWA: sw.js + manifest)
    npm run preview

## Deploy (Vercel)
Import this repo as a Vite project (auto-detected, output `dist/`). `vercel.json` only sets cache headers. Nothing to configure, no secrets.

## Data (no runtime APIs)
The app makes no data requests. All data is static JSON in `src/data/*.json`, bundled into the build and precached by the service worker. Only map tiles (Esri gray canvas, keyless) come from the network.

| File | Source | Rows |
|---|---|---|
| `src/data/fountains.json` | Ayuntamiento de Zaragoza drinking fountains (Zenodo 8141704) | 681 |
| `src/data/wifi.json` | city open data `punto-wifi` | 171 |
| `src/data/libraries.json` | city open data `equipamiento` (Biblioteca*) | 77 |
| `src/data/civic.json` | city open data `equipamiento` (Centro Cívico*) | 25 |
| `src/data/bizi.json` | city open data `estacion-bicicleta` (locations only) | 276 |
| `src/data/toiletsgo.json` | City equipment catalogue places (ids checked), listed as toilets by toiletsgo | 49 |
| `src/data/osm.json` | OpenStreetMap via Overpass | filled by `npm run data` |

Each file is `{ "src", "updated", "rows" }`. Cards show the source and date. The footer shows "Data refreshed <date>".

    npm run data              # rebuild every snapshot (city, Zenodo, toiletsgo, Overpass)
    npm run data -- --no-osm  # skip Overpass
    npm run data -- --fountains PATH   # use a local fountains JSON if Zenodo blocks the download

`scripts/build-data.mjs` fetches, normalises (UTM30N to lat/lon, spatial dedupe) and writes the files. The workflow `.github/workflows/refresh-data.yml` runs it every Monday and on demand, and commits "chore(data): refresh snapshots" only when files changed.

## Design system
Colours, type, shape and motion are tokens in `src/styles.css`; see `docs/design-system.md`. Style follows the Ayuntamiento de Zaragoza public design system. This is an independent project, not affiliated with the Ayuntamiento, and it uses no municipal logo or mark.

Marker colour mapping: water `--color-water` (#006B87), toilets `--color-toilet` (#8B5400), charge `--color-charge` (#8958A9), WiFi `--color-wifi` (#4B83B4), libraries `--color-library` (#006A00), Bizi `--color-bike` (#485D6D).

## Browser check
`e2e/check.mjs` (needs `playwright` installed separately and `npm run build && npx vite preview --port 4173`) blocks all non-tile network, taps every control, checks every layer, measures drawer timings and screenshots at 390x844 and 1280x800.

## Layout
`src/data/*` bundled data, `src/layers/*` layer building, `src/lib/*` geo, utm, hours, cityHours, i18n, rank, `src/ui/*` React components (`PagedDrawer.tsx` = pages in one drawer), `scripts/build-data.mjs` data builder.
