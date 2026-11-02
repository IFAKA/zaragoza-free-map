# Free services · Zaragoza

Mobile-first map of free water, toilets, phone charging, WiFi (plus libraries and Bizi) in Zaragoza. Nearest first. React 19, Vite, strict TypeScript, Tailwind v4, Base UI (`@base-ui/react`), Leaflet, vite-plugin-pwa.

## Run
    npm install
    npm run dev       # dev server
    npm test          # Vitest (UTM conversion, opening_hours, normalisers, ranking)
    npm run build     # type-check + production build in dist/ (PWA: sw.js + manifest)
    npm run preview

## Deploy (Vercel)
Import this repo as a Vite project (auto-detected, output `dist/`). `vercel.json` only sets cache headers. Nothing to configure, no secrets.

## Data sources
- City open data (Ayuntamiento de Zaragoza): `punto-wifi`, `equipamiento/catalog` (libraries `title==Biblioteca*`, civic centres `title==Centro Cívico*`), `estacion-bicicleta` (Bizi, live).
- OpenStreetMap via Overpass: one combined request for WiFi, drinking water, toilets (fee != yes), device charging; 3 endpoints with fallback.
- toiletsgo (github.com/IFAKA/toiletsgo, `src/data.ts`): fetched live from raw.githubusercontent.com, 49-place snapshot bundled (`src/layers/tgo-snapshot.ts`). UTM30N (EPSG:25830) is converted in `src/lib/utm.ts`.
- Each layer is cached in localStorage (`zgz:v1:layer:<id>`), shown first and replaced by live data (stale-while-revalidate). Cards say "live" or "saved copy".

## Layout
`src/layers/*` one file per layer (framework-free loaders and normalisers), `src/lib/*` geo, utm, hours, cache, i18n, rank, `src/ui/*` React components, `src/layer-data.ts` runtime store.
