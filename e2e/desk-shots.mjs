// Desktop screenshots: node e2e/desk-shots.mjs [url] -> /tmp/zgz-desk/<size>-<page>.png (home, bus card, bus line, services, filters, favourites, settings)
import fs from 'node:fs'
import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/', out = process.env.SHOTS || '/tmp/zgz-desk'
fs.mkdirSync(out, { recursive: true })
const b = await chromium.launch()
for (const [w, h] of [[1280, 800], [1920, 1080], [1024, 700]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' })
  await ctx.addInitScript(() => { localStorage.setItem('zgz:v2:lang', 'en'); localStorage.setItem('zgz:v2:layer', 'bus')
    navigator.permissions.query = async () => ({ state: 'denied', addEventListener() {}, removeEventListener() {} }) })
  const p = await ctx.newPage()
  await p.route('**/*', r => { const u = r.request().url(); return u.startsWith(URL) || u.includes('arcgisonline.com') || u.startsWith('data:') ? r.continue() : r.abort() })
  const shot = async n => { await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${w}x${h}-${n}.png` }) }
  const tryClick = async id => { const e = p.getByTestId(id).first(); if (await e.count()) { await e.click(); return true } return false }
  await p.goto(URL); await p.waitForSelector('[data-testid=nearest]'); await p.waitForTimeout(1500); await shot('1-home')
  if (await tryClick('live-row-open')) await shot('2-stop')
  if (await tryClick('line-more') || await tryClick('bus-line-chip')) await shot('3-line')
  await p.reload(); await p.waitForSelector('[data-testid=nearest]')
  if (await tryClick('services-open')) { await shot('4-services'); await p.keyboard.press('Escape') }
  await p.reload(); await p.waitForSelector('[data-testid=nearest]')
  if (await tryClick('filters-open')) await shot('5-filters')
  await p.reload(); await p.waitForSelector('[data-testid=nearest]')
  if (await tryClick('open-settings')) await shot('6-settings')
  await ctx.close()
}
await b.close(); console.log('shots in', out)
