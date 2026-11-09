import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        lang: 'es',
        name: 'Zaragoza a mano',
        short_name: 'Zaragoza a mano',
        description: 'Aseos, agua, bus, farmacias de guardia, Bizi, WiFi y más en Zaragoza. Lo que necesitas, cerca de ti.',
        theme_color: '#D92A22',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, fonts and all bundled data are precached. The network is used for map tiles (cached at runtime (stale-while-revalidate)) and for the live duty-pharmacy list and Bizi counts (never cached here).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/\.well-known\//, /^\/privacy\.html$/, /^\/api\//],
        runtimeCaching: [
          // duty pharmacies change every day: never serve them from a service worker cache (lib/duty.ts keeps its own copy, dated)
          { urlPattern: ({ url }) => url.hostname === 'www.zaragoza.es' && url.pathname.startsWith('/sede/servicio/farmacia'), handler: 'NetworkOnly' },
          // live Bizi bike and dock counts: never from a service worker cache either (lib/bizi.ts keeps its own copy, with its time)
          { urlPattern: ({ url }) => url.hostname === 'api.citybik.es', handler: 'NetworkOnly' },
          {
            urlPattern: ({ url }) => url.hostname === 'server.arcgisonline.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  // Leaflet loads as its own chunk (see App.tsx); the rest is app code plus the baked-in city data
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Stable vendor and data chunks: an app update re-downloads only the app code, not React or the city data
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/, priority: 20 },
            { name: 'baseui', test: /node_modules[\\/]@base-ui[\\/]/, priority: 20 },
            { name: 'citydata', test: /src[\\/]data[\\/](bizi|cercanias|civic|fountains|libraries|post|osm|shelters|tram|toiletsgo|wifi)\.json/, priority: 10 },
          ],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
