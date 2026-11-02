// Screenshots for review: node e2e/shots.mjs [url]  -> /tmp/zgz-shots/<size>-<lang>-<shot>.png (bus card, bus line, tram, cercanias, toilets)
import fs from 'node:fs'
import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/', out = process.env.SHOTS || '/tmp/zgz-shots'
fs.mkdirSync(out, { recursive: true })
const b = await chromium.launch()
const sizes = [[360, 740, true], [390, 844, true], [1280, 800, false]]
for (const [w, h, mobile] of sizes) for (const lang of ['es', 'en']) {
  if (!mobile && lang === 'en') continue
  for (const layer of ['bus', 'bus-line', 'tram', 'cercanias', 'toilets']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' })
    await ctx.addInitScript(([l, y]) => { localStorage.setItem('zgz:v2:lang', l); localStorage.setItem('zgz:v2:layer', y)
      navigator.permissions.query = async () => ({ state: 'denied', addEventListener() {}, removeEventListener() {} }) }, [lang, layer === 'bus-line' ? 'bus' : layer])
    const p = await ctx.newPage()
    await p.route('**/*', r => { const u = r.request().url(); return u.startsWith(URL) || u.includes('arcgisonline.com') || u.startsWith('data:') ? r.continue() : r.abort() })
    await p.goto(URL); await p.waitForSelector('[data-testid=nearest]'); await p.waitForTimeout(1200)
    if (layer === 'bus-line') { await p.waitForSelector('[data-testid=bus-line-chip]'); await p.getByTestId('bus-line-chip').first().click(); await p.waitForSelector('[data-testid=line-steps]'); await p.waitForTimeout(3000) }
    await p.screenshot({ path: `${out}/${w}x${h}-${lang}-${layer}.png` })
    await ctx.close()
  }
}
await b.close(); console.log('shots in', out)
