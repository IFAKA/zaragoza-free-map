// Counts requests to the city's live API per URL: node scripts/count-live.mjs [url] [seconds]
// Opens the built preview (npm run build && npx vite preview --port 4173) at 375x721 near the centre, for bus, tram and the bus route view.
import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/', SECS = +(process.argv[3] || 70)
const b = await chromium.launch()
async function run(name, layer, routeView) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 721 }, hasTouch: true, isMobile: true, geolocation: { latitude: 41.6488, longitude: -0.8891 }, permissions: ['geolocation'], serviceWorkers: 'block', locale: 'es-ES' })
  await ctx.addInitScript(l => { localStorage.setItem('zgz:v2:layer', l); localStorage.setItem('zgz:v2:lang', 'es') }, layer)
  const p = await ctx.newPage(), hits = {}, t0 = Date.now()
  await p.route('**/*', r => {
    const u = r.request().url()
    if (u.includes('/transporte-urbano/')) {
      const k = u.split('transporte-urbano/')[1]; (hits[k] ??= []).push(Math.round((Date.now() - t0) / 1000))
      const line = 'T1'
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ destinos: [{ linea: line, destino: 'CENTRO', primero: '3 minutos.', segundo: '11 minutos.', minutos: '3 minutos.' }] }) })
    }
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue()
    return r.abort()
  })
  await p.goto(URL); await p.waitForSelector('[data-testid=live-times], [data-testid=bus-line-chip]', { timeout: 20000 }).catch(() => {})
  if (routeView) { const c = p.getByTestId('bus-line-chip').first(); await c.tap().catch(() => {}) }
  await p.waitForTimeout(SECS * 1000)
  console.log(name, JSON.stringify(hits))
  await ctx.close()
}
await Promise.all([run('bus', 'bus', false), run('tram', 'tram', false), run('route', 'bus', true)])
await b.close()
