# Zaragoza a mano (Zaragoza at hand)

Tagline: "Lo que necesitas, cerca de ti" / "What you need, near you". Mobile-first map of public services in Zaragoza: toilets, water, Bizi, bus stops, pharmacies on duty, WiFi, phone charging, libraries and climate shelters. Nearest first. Not everything is free: bus and Bizi cost money and a bar toilet is for customers, so the app never calls a whole tab free (only single places, like a fountain). The repository folder and package name keep their old names. React 19, Vite, strict TypeScript, Tailwind v4, Base UI (`@base-ui/react`), Leaflet, vite-plugin-pwa.

## Run
    npm install
    npm run dev       # dev server
    npm test          # Vitest (UTM, opening hours, city hours, normalisers, data checks)
    npm run build     # type-check + production build in dist/ (PWA: sw.js + manifest)
    npm run preview

## Deploy (Vercel)
Import this repo as a Vite project (auto-detected, output `dist/`). `vercel.json` only sets cache headers. Nothing is required. Optional anonymous statistics (GoatCounter, free, cookieless, no location or searches, off when the browser sends Do Not Track): create a site at goatcounter.com, then in Vercel go to Project Settings > Environment Variables, add `VITE_GOATCOUNTER_CODE` (the site code, the part before `.goatcounter.com`), then redeploy. Without it, or in dev, no script loads. The script is not precached by the service worker, so the app works offline.

## Data (static, with two live exceptions)
All data is static JSON in `src/data/*.json`, bundled into the build and precached by the service worker. Network requests: map tiles (Esri gray canvas, keyless), and TWO live feeds, both fetched in the browser only while their tab is open, and never cached by the service worker (`NetworkOnly`). 1) The pharmacies on duty today (`https://www.zaragoza.es/sede/servicio/farmacia.json`, CORS open). It changes every day, so it is fetched in the browser when the Pharmacy tab is opened (`src/lib/duty.ts`), saved in localStorage with its date, and shown only if the duty date is today in Madrid. If the fetch fails and there is no list saved for today, the tab says so, with Try again and a link to the city page. The service worker never caches it (`NetworkOnly`).

2) Bizi live counts: `GET https://api.citybik.es/v2/networks/bizi` (CityBikes, CORS open, 276 stations; the limit is 300 requests per hour per IP). The static `bizi.json` rows stay the source of the places, so the stations show offline. Each live station is joined to a row by position (under 40 m) or by the number in its name (on the real feed both agree for all 276). Counts are fetched when the Bizi tab opens, then every 60 seconds while the page is visible (paused when hidden), and saved in localStorage with the fetch time (`src/lib/bizi.ts`, `src/ui/useBizi.ts`). Counts older than 5 minutes, or a feed whose own station stamps are older than 5 minutes, are never shown as live: the tab says "Live counts unavailable" with Try again, and the places still show. The chips "Take a bike" (default, stations with at least one bike, nearest first), "Return a bike" (stations with a free dock) and "My bike" (street racks, `racks.json`) replace the old racks tab. The CityBikes feed writes its time as `...+00:00Z`; the stray `Z` is stripped before parsing.

| File | Source | Rows |
|---|---|---|
| `src/data/fountains.json` | Ayuntamiento de Zaragoza drinking fountains (Zenodo 8141704) | 681 |
| `src/data/wifi.json` | city open data `punto-wifi` | 171 |
| `src/data/libraries.json` | city open data `equipamiento` (Biblioteca*) | 77 |
| `src/data/civic.json` | city open data `equipamiento` (Centro Cívico*) | 25 |
| `src/data/bizi.json` | city open data `estacion-bicicleta` (locations; bike and dock counts come live from CityBikes, see above) | 276 |
| `src/data/bus.json` | city open data `poste-autobus` (bus stops: number, name, lines, position; 983 city stops link to the bus company live times page, 288 rural stops have no live page) | 1271 |
| `src/data/racks.json` | city open data `aparcamiento-bicicleta` (AparcaBicis: street racks for your own bike; shown under the Bizi tab, chip "My bike") | 2158 |
| `src/data/shelters.json` | city open data `refugios_climaticos` (climate shelters: civic centres, senior centres, 2 offices; dataset page 6740) | 57 |
| `src/data/toiletsgo.json` | City equipment catalogue places (ids checked), listed as toilets by toiletsgo | 49 |
| `src/data/osm.json` | OpenStreetMap via Overpass | filled by `npm run data` |

Each file is `{ "src", "updated", "rows" }`. Cards show the source and date. The footer shows "Data refreshed <date>".

    npm run data              # rebuild every snapshot (city, Zenodo, toiletsgo, Overpass)
    npm run data -- --no-osm  # skip Overpass
    npm run data -- --shelters-only    # rebuild only shelters.json (--shelters PATH reads a local GeoJSON)
    npm run data -- --fountains PATH   # use a local fountains JSON if Zenodo blocks the download

`scripts/build-data.mjs` fetches, normalises (UTM30N to lat/lon, spatial dedupe) and writes the files. The workflow `.github/workflows/refresh-data.yml` runs it every Monday and on demand, and commits "chore(data): refresh snapshots" only when files changed. The script never fetches live data: pharmacies and Bizi counts are read in the browser only, so `bizi.json` holds places (name and position) and nothing that changes by the minute.

## Design system
Colours, type, shape and motion are tokens in `src/styles.css`; see `docs/design-system.md`. Style follows the Ayuntamiento de Zaragoza public design system. This is an independent project, not affiliated with the Ayuntamiento, and it uses no municipal logo or mark.

Marker colour mapping: water `--color-water` (#006B87), toilets `--color-toilet` (#8B5400), charge `--color-charge` (#8958A9), WiFi `--color-wifi` (#4B83B4), libraries `--color-library` (#006A00), Bizi `--color-bike` (#485D6D), bike racks `--color-rack` (#6B6B00), bus stops `--color-bus` (#3B4BA6), pharmacies on duty `--color-pharmacy` (#B3261E), warm or cool indoors `--color-shelter` (#A3315F).

## Credits for live data
Live Bizi bike and dock counts: [CityBikes](https://citybik.es) (`api.citybik.es`). The About page credits it in English and Spanish and says the counts are live. Pharmacies on duty: Ayuntamiento de Zaragoza.

## Tabs and first moment
Order: Toilets, Water, Bizi, Bus, Pharmacy, WiFi, Charge, Libraries, with Warm (shelter) third in its season and last otherwise. A first visit opens on Toilets; a saved choice wins. The tab row scrolls, and a half-cut tab shows at the right edge on a 390 px phone. The first tab tap asks for the location once (if the browser has not blocked it), inside the tap so browsers allow the prompt. Until then the list says "Distances from the city centre" with a big Use my location button; if blocked it shows one calm line on how to allow it. The anonymous events `locate-granted` and `locate-denied` are counted (no coordinates). The "add to home screen" hint is hidden when installed and in in-app browsers (Reddit, Instagram, Facebook, TikTok, Android WebView, iOS without Safari), see `src/lib/install.ts`.

## Browser check
`e2e/check.mjs` (needs `playwright` installed separately and `npm run build && npx vite preview --port 4173`) blocks all non-tile network (the CityBikes feed is mocked), taps every control, checks the Bizi counts, stale and failed states, chips, the half-cut tab, the first-tap location prompt (granted, denied, blocked), the install hint under in-app browser UAs, one Pixel 7 emulation run, checks every layer, measures drawer timings and screenshots at 390x844 and 1280x800.

## Layout
`src/data/*` bundled data, `src/layers/*` layer building, `src/lib/*` geo, utm, hours, cityHours, i18n, rank, bizi (live counts), duty (pharmacies), install (in-app browser check), `src/ui/*` React components (`PagedDrawer.tsx` = pages in one drawer), `scripts/build-data.mjs` data builder.
