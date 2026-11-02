// Browser check: node e2e/check.mjs [url]   (needs `playwright` installed and the app served, e.g. npm run build && npx vite preview --port 4173)
// - blocks every request except the app itself and map tiles (the app must work with no data API)
// - every layer renders markers; Water works; every control is tapped; drawer timings are measured
import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/'
const out = process.env.SHOTS || '/tmp/zgz-pw'
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const b = await chromium.launch()
async function open(vp, mobile, extra = {}) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, locale: 'en-US', timezoneId: 'Europe/Madrid', ...extra })
  const p = await ctx.newPage()
  const blocked = []
  p.on('pageerror', e => { fails++; console.log('FAIL pageerror', e.message) })
  await p.route('**/*', r => {
    const u = r.request().url()
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue()
    if (u.includes('server.arcgisonline.com')) return r.continue()
    blocked.push(u); return r.abort()
  })
  await p.goto(URL); await p.waitForTimeout(1000)
  return { ctx, p, blocked }
}
const markers = p => p.locator('.mk').count()
const snapTop = p => p.evaluate(() => Math.round(document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top))

// ---- mobile ----
{
  const { ctx, p, blocked } = await open({ width: 390, height: 844 }, true)
  ok(blocked.length === 0, `no non-tile network requests (${blocked.length})`)
  ok(await markers(p) > 0, 'water markers drawn')
  ok(await p.getByTestId('nearest-name').innerText() !== '', 'nearest water shown at once')
  for (const id of ['water', 'toilets', 'charge', 'wifi']) {
    await p.getByTestId('tab-' + id).click(); await p.waitForTimeout(500)
    ok(await markers(p) > 0, `layer ${id} renders markers`)
    ok(await p.getByTestId('nearest-name').count() === 1, `layer ${id} shows nearest`)
  }
  // tab tap raised the drawer from peek
  const topHalf = await snapTop(p)
  ok(topHalf < 844 - 300, `tab tap raised drawer (top ${topHalf})`)
  // handle cycles half -> full -> peek
  await p.getByTestId('handle').click(); await p.waitForTimeout(700)
  ok(await snapTop(p) < 120, 'handle goes to full')
  await p.getByTestId('handle').click(); await p.waitForTimeout(700)
  ok(await snapTop(p) > 500, 'handle goes to peek')
  // Open now switch persisted
  await p.getByTestId('tab-toilets').click(); await p.waitForTimeout(400)
  const sw = p.getByTestId('switch-open')
  ok(await sw.getAttribute('aria-checked') === 'true' || (await sw.getAttribute('data-checked')) !== null, 'Open now ON by default')
  await sw.click(); await p.reload(); await p.waitForTimeout(800)
  await p.getByTestId('tab-toilets').click(); await p.waitForTimeout(400)
  ok(await p.getByTestId('switch-open').getAttribute('aria-checked') === 'false', 'Open now OFF persisted after reload')
  await p.getByTestId('switch-open').click()
  // water has no switch
  await p.getByTestId('tab-water').click(); await p.waitForTimeout(400)
  ok(await p.getByTestId('switch-open').count() === 0, 'water: no Open now switch')
  // wifi: range switch and chips
  await p.getByTestId('tab-wifi').click(); await p.waitForTimeout(500)
  await p.getByTestId('switch-range').click(); await p.getByTestId('switch-range').click()
  for (const name of ['Public buildings', 'Cafés and bars', 'Other', 'All']) { await p.getByRole('radio', { name }).or(p.getByRole('button', { name })).first().click(); await p.waitForTimeout(150) }
  // details page, back, escape
  await p.getByTestId('details').click(); await p.waitForTimeout(700)
  ok(await p.getByTestId('back').count() === 1, 'details page opened in same drawer')
  ok(await p.getByRole('link', { name: /Report/ }).getAttribute('href').then(h => h.includes('openstreetmap.org/note')), 'report link')
  await p.keyboard.press('Escape'); await p.waitForTimeout(700)
  ok(await p.getByTestId('back').count() === 0, 'Escape goes up a page')
  await p.getByTestId('details').click(); await p.waitForTimeout(500)
  await p.getByTestId('back').click(); await p.waitForTimeout(500)
  ok(await p.getByTestId('back').count() === 0, 'Back goes up a page')
  // More: libraries, bizi, language, about
  await p.getByTestId('tab-more').click(); await p.waitForTimeout(600)
  await p.screenshot({ path: out + '/m-more.png' })
  await p.getByTestId('more-libraries').click(); await p.waitForTimeout(700)
  ok(await markers(p) > 0, 'libraries render')
  ok(await p.getByText(/Live occupancy|Occupancy not published/).count() > 0, 'library occupancy line honest')
  const pop = p.getByRole('button', { name: 'Why no numbers?' }).first()
  if (await pop.count()) { await pop.click(); await p.waitForTimeout(300); ok(await p.getByText(/do not guess/).isVisible(), 'occupancy info popover opens'); await p.keyboard.press('Escape') }
  await p.screenshot({ path: out + '/m-libs.png' })
  await p.getByTestId('tab-more').click(); await p.waitForTimeout(500)
  await p.getByTestId('more-bizi').click(); await p.waitForTimeout(700)
  ok(await markers(p) > 0, 'bizi locations render')
  ok(await p.getByText(/no live connection/).count() > 0, 'bizi says no availability numbers')
  await p.getByTestId('tab-more').click(); await p.waitForTimeout(500)
  await p.getByTestId('more-language').click(); await p.waitForTimeout(600)
  await p.getByTestId('lang-es').click(); await p.waitForTimeout(300)
  ok(await p.getByText('Idioma').count() > 0, 'Spanish applied')
  await p.getByTestId('back').click(); await p.waitForTimeout(500)
  ok(await p.getByTestId('more-about').count() === 1, 'language back to More')
  await p.getByTestId('more-about').click(); await p.waitForTimeout(600)
  ok(await p.getByText(/Datos actualizados/).count() > 0, 'about shows data refreshed date')
  ok(await p.getByText(/sin relación con el Ayuntamiento/).count() > 0, 'disclaimer')
  await p.screenshot({ path: out + '/m-about.png' })
  await p.getByTestId('back').click(); await p.getByTestId('back').click(); await p.waitForTimeout(500)
  await p.getByTestId('tab-more').click(); await p.getByTestId('more-language').click(); await p.getByTestId('lang-en').click(); await p.getByTestId('back').click(); await p.getByTestId('back').click()
  await ctx.close()
}
// ---- drawer timings ----
{
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  const t = await p.evaluate(async () => {
    const pop = document.querySelector('[data-slot=drawer-popup]')
    const cs = getComputedStyle(pop)
    const sp = v => v.split(/, (?![^(]*\))/)
    const props = sp(cs.transitionProperty), durs = sp(cs.transitionDuration), eas = sp(cs.transitionTimingFunction)
    const r = {}
    props.forEach((k, i) => { r[k] = durs[i] + ' ' + eas[i] })
    return r
  })
  console.log('drawer transition (computed):', JSON.stringify(t))
  ok(t.transform && t.transform.startsWith('0.45s') && t.transform.includes('cubic-bezier(0.22, 1, 0.36, 1)'), 'drawer transform 450ms cubic-bezier(.22,1,.36,1)')
  // measured: time from tap to transform settling, and the page fade
  const m = await p.evaluate(() => new Promise(res => {
    const pop = document.querySelector('[data-slot=drawer-popup]')
    const t0 = performance.now()
    let tr0 = null
    pop.addEventListener('transitionrun', e => { if (e.propertyName === 'transform' && tr0 === null) tr0 = performance.now() })
    pop.addEventListener('transitionend', e => { if (e.propertyName === 'transform') res({ transformMs: Math.round(performance.now() - tr0), startLag: Math.round(tr0 - t0) }) })
    document.querySelector('[data-testid=handle]').click()
  }))
  console.log('measured snap peek->half:', JSON.stringify(m))
  ok(Math.abs(m.transformMs - 450) < 60, `measured transform ${m.transformMs}ms ~ 450ms`)
  await p.waitForTimeout(500)
  await p.getByTestId('tab-more').click()
  const f = await p.evaluate(() => { const el = document.querySelector('.page-in'); const cs = getComputedStyle(el); return { dur: cs.animationDuration, name: cs.animationName } })
  console.log('page fade:', JSON.stringify(f))
  ok(f.dur === '0.3s', 'page fade 300ms')
  await ctx.close()
}
// ---- reduced motion ----
{
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { reducedMotion: 'reduce' })
  await p.getByTestId('tab-more').click()
  const f = await p.evaluate(() => { const el = document.querySelector('.page-in'); return getComputedStyle(el).animationName })
  console.log('reduced-motion page animation:', f)
  await ctx.close()
}
// ---- red only on interactive elements and titles (computed colour scan) ----
{
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await p.getByTestId('handle').click(); await p.waitForTimeout(700)
  const bad = await p.evaluate(() => {
    const reds = new Set(['rgb(217, 42, 34)'])
    const isInteractive = el => !!el.closest('button,a,[role=tab],[role=switch],[role=radio],[role=button],label,h1,h2,h3,.font-title')
    const out = []
    for (const el of document.querySelectorAll('[data-slot=drawer-popup] *')) {
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue
      if (reds.has(getComputedStyle(el).color) && !isInteractive(el)) out.push(el.outerHTML.slice(0, 80))
    }
    return out
  })
  ok(bad.length === 0, 'red text only on interactive elements and titles ' + JSON.stringify(bad))
  await p.screenshot({ path: out + '/m-half.png' })
  // scroll handoff: at full, scrolling the list scrolls; drag down at top returns the drawer
  await p.getByTestId('handle').click(); await p.waitForTimeout(700)
  await p.screenshot({ path: out + '/m-full.png' })
  const sc = await p.evaluate(() => { const v = document.querySelector('[data-testid=scroll]'); v.scrollTop = 300; return v.scrollTop })
  ok(sc > 0, 'list scrolls at full')
  await ctx.close()
}
// ---- desktop ----
{
  const { ctx, p, blocked } = await open({ width: 1280, height: 800 }, false)
  ok(blocked.length === 0, 'desktop: no non-tile requests')
  const w = await p.getByTestId('panel').evaluate(e => e.getBoundingClientRect().width)
  ok(w === 400, 'desktop panel 400px')
  await p.screenshot({ path: out + '/d-water.png' })
  for (const id of ['toilets', 'charge', 'wifi', 'water']) { await p.getByTestId('tab-' + id).click(); await p.waitForTimeout(400); ok(await markers(p) > 0, `desktop ${id} renders`) }
  await p.getByTestId('tab-more').click(); await p.getByTestId('more-libraries').click(); await p.waitForTimeout(700)
  await p.screenshot({ path: out + '/d-libs.png' })
  await ctx.close()
}
await b.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
