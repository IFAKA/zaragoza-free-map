// Browser check: node e2e/check.mjs [url]   (needs `playwright` installed and the app served, e.g. npm run build && npx vite preview --port 4173)
// - blocks every request except the app itself and map tiles (the app must work with no data API)
// - every layer renders markers; Water works; every control is tapped; drawer timings are measured
import os from 'node:os'
import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/'
const out = process.env.SHOTS || '/tmp/zgz-pw'
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const b = await chromium.launch()
const todo = [], late = [] // each block below is independent (own browser context): `todo` blocks run in parallel, `late` (timing measurements) alone afterwards
async function open(vp, mobile, extra = {}, lang = 'en') {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, locale: 'en-US', timezoneId: 'Europe/Madrid', ...extra })
  if (lang) await ctx.addInitScript(l => { if (!localStorage.getItem('zgz:v2:lang')) localStorage.setItem('zgz:v2:lang', l) }, lang)
  // the app opens on the seasonal default layer (Calor in the cold months, often empty at night); these checks start on toilets
  await ctx.addInitScript(() => { if (!localStorage.getItem('zgz:v2:layer')) localStorage.setItem('zgz:v2:layer', 'toilets') })
  const p = await ctx.newPage()
  const blocked = []
  p.on('pageerror', e => { fails++; console.log('FAIL pageerror', e.message) })
  await p.route('**/*', r => {
    const u = r.request().url()
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue()
    if (u.includes('server.arcgisonline.com')) return r.continue()
    blocked.push(u); return r.abort()
  })
  await p.goto(URL); await ready(p)
  return { ctx, p, blocked }
}
// Wait until the page stops moving: no running animation or transition, and the drawer, map and a marker hold still for 4 frames. Replaces fixed sleeps.
const settle = p => p.evaluate(() => new Promise(res => {
  const state = () => {
    const pop = document.querySelector('[data-slot=drawer-popup]'), mk = document.querySelector('.mk'), mp = document.querySelector('.leaflet-map-pane')
    const running = document.getAnimations().filter(a => a.playState === 'running').length
    return { running, sig: [pop?.getBoundingClientRect().top, mk?.getBoundingClientRect().x, mp?.style.transform].join('|') }
  }
  let last = '', same = 0, frames = 0
  const f = () => { const { running, sig } = state(); if (sig === last) same++; else { same = 0; last = sig } if ((same >= 4 && running === 0 && frames >= 8) || ++frames > 150) res(); else requestAnimationFrame(f) }
  f()
}))
const ready = async p => { await p.waitForSelector('.mk'); await settle(p) }
const markers = p => p.locator('.mk').count()
const snapTop = p => p.evaluate(() => Math.round(document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top))

// ---- mobile ----
todo.push(async () => {
  const { ctx, p, blocked } = await open({ width: 390, height: 844 }, true)
  ok(blocked.length === 0, `no non-tile network requests (${blocked.length})`)
  ok(await markers(p) > 0, 'toilets markers drawn')
  ok(await p.getByTestId('nearest-name').innerText() !== '', 'nearest toilet shown at once')
  for (const id of ['charge', 'wifi', 'water', 'toilets']) {
    await p.getByTestId('tab-' + id).click(); await settle(p)
    ok(await markers(p) > 0, `layer ${id} renders markers`)
    ok(await p.getByTestId('nearest-name').count() === 1, `layer ${id} shows nearest`)
  }
  // tapping another tab at peek keeps the sheet at peek (the nearest-place card is already in view)
  ok(Math.abs(await snapTop(p) - 560) < 6, `tab tap at peek keeps peek (top ${await snapTop(p)})`)
  // handle cycles peek -> half -> full -> peek
  await p.getByTestId('handle').click(); await settle(p)
  ok(Math.abs(await snapTop(p) - 344) < 6, 'handle goes to half')
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) < 120, 'handle goes to full')
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) > 500, 'handle goes to peek')
  await p.getByTestId('handle').click(); await settle(p) // half again: the controls below need room
  // Open now switch persisted
  const sw = p.getByTestId('switch-open')
  ok(await sw.getAttribute('aria-checked') === 'true' || (await sw.getAttribute('data-checked')) !== null, 'Open now ON by default')
  await sw.click(); await p.reload(); await ready(p)
  await p.getByTestId('handle').click(); await settle(p) // reload starts at peek
  ok(await p.getByTestId('switch-open').getAttribute('aria-checked') === 'false', 'Open now OFF persisted after reload')
  await p.getByTestId('switch-open').click()
  // water has no switch
  await p.getByTestId('tab-water').click(); await settle(p)
  ok(await p.getByTestId('switch-open').count() === 0, 'water: no Open now switch')
  // wifi: range switch and chips
  await p.getByTestId('tab-wifi').click(); await settle(p)
  await p.getByTestId('switch-range').click(); await p.getByTestId('switch-range').click()
  for (const name of ['Public buildings', 'Cafés and bars', 'Other', 'All']) { await p.getByRole('radio', { name }).or(p.getByRole('button', { name })).first().click(); await settle(p) }
  // details page, back, escape
  await p.getByTestId('details').click(); await settle(p)
  ok(await p.getByTestId('back').count() === 1, 'details page opened in same drawer')
  ok(await p.getByRole('link', { name: /Report/ }).getAttribute('href').then(h => h.includes('openstreetmap.org/note')), 'report link')
  await p.keyboard.press('Escape'); await settle(p)
  ok(await p.getByTestId('back').count() === 0, 'Escape goes up a page')
  await p.getByTestId('details').click(); await settle(p)
  await p.getByTestId('back').click(); await settle(p)
  ok(await p.getByTestId('back').count() === 0, 'Back goes up a page')
  // More: libraries, bizi, language, about
  await p.getByTestId('tab-libraries').click(); await settle(p)
  ok(await markers(p) > 0, 'libraries render')
  ok(await p.getByText(/Live occupancy|Occupancy not published/).count() > 0, 'library occupancy line honest')
  const pop = p.getByRole('button', { name: 'Why no numbers?' }).first()
  if (await pop.count()) { await pop.click(); await settle(p); ok(await p.getByText(/do not guess/).isVisible(), 'occupancy info popover opens'); await p.keyboard.press('Escape') }
  await p.screenshot({ path: out + '/m-libs.png' })
  await p.getByTestId('tab-racks').click(); await settle(p)
  ok(await markers(p) > 0, 'bike racks render')
  await p.getByTestId('tab-bizi').click(); await settle(p)
  ok(await markers(p) > 0, 'bizi locations render')
  ok(await p.getByText(/no live connection/).count() > 0, 'bizi says no availability numbers')
  await p.getByTestId('open-settings').click(); await settle(p)
  await p.screenshot({ path: out + '/m-settings.png' })
  await p.getByTestId('row-language').click(); await settle(p)
  await p.getByTestId('lang-es').click(); await settle(p)
  ok(await p.getByText('Idioma').count() > 0, 'Spanish applied')
  await p.getByTestId('back').click(); await settle(p)
  ok(await p.getByTestId('row-about').count() === 1, 'language back to Settings')
  await p.getByTestId('row-about').click(); await settle(p)
  ok(await p.getByText(/Datos actualizados/).count() > 0, 'about shows data refreshed date')
  ok(await p.getByText(/sin relación con el Ayuntamiento/).count() > 0, 'disclaimer')
  await p.screenshot({ path: out + '/m-about.png' })
  await p.getByTestId('back').click(); await settle(p)
  ok(await p.getByTestId('row-about').count() === 1, 'About opened from Settings: Back returns to Settings')
  await p.getByTestId('back').click(); await settle(p)
  ok(await p.getByTestId('tab-water').count() === 1, 'then Back returns to the first page')
  await p.getByTestId('open-settings').click(); await p.getByTestId('row-language').click(); await p.getByTestId('lang-en').click(); await p.getByTestId('back').click(); await p.getByTestId('back').click()
  await ctx.close()
})

// ---- drawer behaviour: real touch drags (CDP) at 390x844 ----
{
  const LEVEL = { closed: [700, 844], peek: [520, 600], half: [320, 370], full: [70, 110] }
  const lvl = async p => { const t = await snapTop(p); return Object.entries(LEVEL).find(([, [a, z]]) => t >= a && t <= z)?.[0] ?? 'top=' + t }
  const sess = async () => {
    const o = await open({ width: 390, height: 844 }, true)
    await o.p.waitForTimeout(600)
    const cdp = await o.ctx.newCDPSession(o.p)
    const drag = async (x, y0, y1, ms = 300) => {
      const n = Math.max(4, Math.round(ms / 16))
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / n }] }); await o.p.waitForTimeout(ms / n) }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await o.p.waitForTimeout(450) // the sheet snap animation takes ~450ms; settle() alone can fire before it starts
      await settle(o.p)
    }
    return { ...o, drag }
  }
  // a spot on the bare map (no marker, no control) above the peek sheet
  const bare = p => p.evaluate(() => { for (let y = 120; y < 330; y += 30) for (let x = 40; x < 360; x += 40) { const e = document.elementFromPoint(x, y); if (e && e.closest('.leaflet-container') && !e.closest('.mkw,.leaflet-control')) return { x, y } } return null })
  const scrollTop = p => p.evaluate(() => document.querySelector('[data-testid=scroll]').scrollTop)
  // peek -> half -> full by dragging the handle, content or tab bar
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    ok(await lvl(p) === 'peek', 'starts at peek')
    await drag(195, 570, 300); ok(await lvl(p) === 'half', 'handle drag up: peek -> half')
    await p.screenshot({ path: out + '/g-half.png' })
    await drag(195, 600, 250); ok(await lvl(p) === 'full', 'content drag up at half -> full')
    await p.screenshot({ path: out + '/g-full.png' })
    // full: content scrolls; a drag down while scrolled scrolls back; at the top the same drag lowers the sheet
    await drag(195, 700, 300); ok(await scrollTop(p) > 100 && await lvl(p) === 'full', 'full: content drag scrolls the list, sheet stays')
    await drag(195, 300, 450, 200); ok(await lvl(p) === 'full', 'full: drag down while scrolled does not move the sheet')
    await p.evaluate(() => { document.querySelector('[data-testid=scroll]').scrollTop = 0 })
    await drag(195, 300, 600); ok(await lvl(p) === 'half', 'full: drag down at list top hands the gesture to the sheet (-> half)')
    await drag(195, 500, 700, 300); ok(['peek', 'closed'].includes(await lvl(p)), 'half: drag down on content lowers the sheet')
    await ctx.close()
  })
  // down to closed and back
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 570, 300); ok(await lvl(p) === 'half', 'to half')
    await drag(195, 380, 520, 300); ok(await lvl(p) === 'peek', 'half -> peek by dragging down')
    await drag(195, 580, 760, 300); ok(await lvl(p) === 'closed', 'peek -> closed by dragging down')
    await p.screenshot({ path: out + '/g-closed.png' })
    const vis = await p.evaluate(() => { const r = n => document.querySelector(`[data-testid=${n}]`).getBoundingClientRect(); return { tab: r('tab-water').bottom, more: r('tab-bizi').bottom, h: innerHeight, handle: r('handle') } })
    ok(vis.tab <= vis.h && vis.more <= vis.h, `closed: whole tab bar on screen (bottom ${Math.round(vis.tab)} of ${vis.h})`)
    ok(vis.handle.bottom <= vis.h && vis.handle.height >= 24 && vis.handle.width >= 44, 'closed: handle visible, at least 44 wide and 24 tall')
    ok(await p.getByTestId('scroll').evaluate(e => !!e.closest('[inert]')), 'closed: page body is inert (no focus off-screen)')
    ok(await p.locator('.mk').count() > 0 && (await p.getByTestId('map').boundingBox()).height === 844, 'closed: map fully visible')
    await p.getByTestId('tab-toilets').tap(); await settle(p)
    ok(await lvl(p) === 'half', 'closed: tapping a tab opens to half')
    ok(await p.getByTestId('tab-toilets').getAttribute('aria-selected') === 'true', 'and selects that layer')
    await p.getByTestId('tab-toilets').tap(); await settle(p); ok(await lvl(p) === 'peek', 'tapping the active tab at half folds to peek')
    await p.getByTestId('tab-toilets').tap(); await settle(p); ok(await lvl(p) === 'closed', 'tapping the active tab at peek folds to closed')
    await p.getByTestId('handle').tap(); await settle(p); ok(await lvl(p) === 'half', 'closed: handle tap opens the sheet')
    await ctx.close()
  })
  // flicks (velocity)
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 580, 450, 70); ok(['half', 'full'].includes(await lvl(p)), `fast flick up from peek opens (${await lvl(p)})`)
    await drag(195, 580, 300, 300) // settle on a known level, then flick down
    await p.reload(); await ready(p); await drag(195, 570, 300, 300); ok(await lvl(p) === 'half', 'half')
    await drag(195, 400, 560, 70); ok(['peek', 'closed'].includes(await lvl(p)), `fast flick down from half lowers (${await lvl(p)})`)
    await ctx.close()
  })
  // map tap lowers the sheet
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 570, 300); await drag(195, 600, 250)
    ok(await lvl(p) === 'full', 'at full')
    await p.mouse.click(195, 40); await settle(p); ok(await lvl(p) === 'peek', 'map tap at full -> peek')
    await drag(195, 570, 300)
    const pt = await bare(p); ok(!!pt, 'found a bare map spot')
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'peek', 'map tap at half -> peek')
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'closed', 'map tap at peek -> closed')
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'closed', 'map tap at closed stays closed')
    await ctx.close()
  })
  // marker and row selection reveal the card above the sheet
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await p.getByTestId('tab-water').tap(); await settle(p)
    const before = await p.getByTestId('nearest-name').innerText()
    const mk = await p.evaluate(() => [...document.querySelectorAll('.mk:not(.sel)')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }).find(c => c.y > 80 && c.y < 520 && c.x > 20 && c.x < 370))
    ok(!!mk, 'a marker is visible above the peek sheet')
    await p.touchscreen.tap(mk.x, mk.y); await settle(p)
    ok(await lvl(p) === 'half', 'marker tap opens the sheet at half')
    ok(await p.getByTestId('nearest').getAttribute('aria-label') === 'Selected', 'card says Selected')
    const sel = await p.evaluate(() => { const r = document.querySelector('.mk.sel').getBoundingClientRect(); return { bottom: r.bottom, top: r.top, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top } })
    ok(sel.bottom < sel.sheet - 10 && sel.top > 0, `selected marker sits above the sheet (marker bottom ${Math.round(sel.bottom)}, sheet top ${Math.round(sel.sheet)})`)
    await p.screenshot({ path: out + '/g-marker.png' })
    // row at full
    await drag(195, 600, 250); ok(await lvl(p) === 'full', 'to full')
    const row = p.locator('[data-testid=list] li button').nth(4)
    const rowName = await row.locator('span.truncate').first().innerText()
    await row.tap(); await settle(p)
    ok(await lvl(p) === 'half', 'row tap at full -> half')
    ok(await p.getByTestId('nearest-name').innerText() === rowName, `card shows the tapped row (${rowName})`)
    // the card sits above the list (not inside it); the list scrolls the minimum so the tapped row is fully visible
    const vis = await p.evaluate(() => { const v = document.querySelector('[data-testid=scroll]').getBoundingClientRect(); const r = document.querySelector('[data-testid=list] li.bg-brand-tint')?.getBoundingClientRect(); return r ? { top: Math.round(r.top - v.top), bottom: Math.round(v.bottom - r.bottom) } : null })
    ok(!!vis && vis.top >= -1 && vis.bottom >= -1, `tapped row is fully visible in the list (${JSON.stringify(vis)})`)
    const sel2 = await p.evaluate(() => { const r = document.querySelector('.mk.sel').getBoundingClientRect(); return { bottom: r.bottom, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top } })
    ok(sel2.bottom < sel2.sheet - 10, 'row: its marker sits above the sheet')
    await ctx.close()
  })
  // page stack: About from the footer goes Back to the home page; Escape: page, then lower
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 570, 300); await drag(195, 600, 250)
    await p.evaluate(() => { const v = document.querySelector('[data-testid=scroll]'); v.scrollTop = v.scrollHeight })
    await p.getByRole('button', { name: 'About' }).tap(); await settle(p)
    ok(await p.getByTestId('back').count() === 1, 'About opens from the footer')
    await p.getByTestId('back').tap(); await settle(p)
    ok(await p.getByTestId('tab-water').count() === 1 && await p.getByTestId('row-about').count() === 0, 'About from footer: Back returns to home, not Settings')
    await p.getByTestId('open-settings').tap(); await p.getByTestId('row-about').tap(); await settle(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('row-about').count() === 1, 'Escape on About goes back to Settings')
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('tab-water').count() === 1, 'Escape on Settings goes back to home')
    const l0 = await lvl(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(l0 === 'full' && await lvl(p) === 'half', `Escape on home lowers one step (${l0} -> ${await lvl(p)})`)
    // closing from a sub page lands on home
    await p.getByTestId('open-settings').tap(); await settle(p)
    await p.getByTestId('handle').tap(); await settle(p)
    await ctx.close()
  })
}

// ---- bus stops and duty pharmacies ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await p.getByTestId('tab-bus').tap(); await settle(p)
  ok(await markers(p) > 500, 'Bus: stops are drawn')
  const next = p.getByTestId('next-buses')
  ok(await next.count() === 1 && /poste=\d+/.test(await next.getAttribute('href') || ''), 'Bus card: one Next buses link to the bus company page')
  ok(await p.getByTestId('bus-lines').count() === 1 && await p.getByTestId('walk').count() >= 1, 'Bus card: shows the lines and a Walk button')
  await ctx.close()
})
const farm = (date, hours = '09:00-22:00') => ({ result: [{ id: 'x1', title: 'Farmacia Test', geometry: { type: 'Point', coordinates: [-0.8773, 41.6488] }, calle: 'Calle Test 1', telefonos: '976000000', guardia: { fecha: date, horario: hours, sector: 'Centro' } }] })
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { serviceWorkers: 'block' })
  await p.route('**/farmacia.json*', r => r.fulfill({ status: 500, body: 'no' }))
  await p.getByTestId('tab-pharmacy').tap(); await settle(p)
  ok(await p.getByTestId('duty-failed').count() === 1 && await p.getByTestId('duty-retry').count() === 1, 'Pharmacy: failed load shows the message and Try again')
  ok((await p.getByTestId('duty-city').getAttribute('href') || '').includes('zaragoza.es/sede/servicio/farmacia'), 'Pharmacy: failure links to the city page')
  ok(await p.getByTestId('walk').count() === 0, 'Pharmacy: no old list shown on failure')
  await p.unroute('**/farmacia.json*')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  await p.route('**/farmacia.json*', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(farm(today)) }))
  await p.getByTestId('duty-retry').tap(); await settle(p)
  ok(await p.getByTestId('duty-failed').count() === 0 && await p.getByTestId('walk').count() === 1 && /Farmacia Test/.test(await p.locator('body').innerText()), 'Pharmacy: Try again loads today\'s duty pharmacy and shows its card')
  ok(/09:00-22:00/.test(await p.locator('body').innerText()), 'Pharmacy: card shows the guardia hours')
  await ctx.close()
})

// ---- Spanish by default, one fixed tab row, Settings page ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, null) // browser says en-US, nothing saved
  ok(await p.evaluate(() => document.documentElement.lang) === 'es', 'default language is Spanish although the browser says English')
  ok(await p.title() === 'Servicios gratis · Zaragoza', 'page title in Spanish')
  const man = await p.evaluate(() => fetch('/manifest.webmanifest').then(r => r.json()))
  ok(man.lang === 'es' && /gratis/.test(man.name), `manifest lang es (${man.lang}, ${man.name})`)
  const labels = await p.locator('[role=tab]').allInnerTexts()
  ok(JSON.stringify(labels) === JSON.stringify(['Calor', 'Bus', 'Farmacia', 'Aseos', 'Biblio.', 'Bizi', 'WiFi', 'Cargar', 'Agua', 'Aparcab.']), 'tab row: ' + labels.join(' | '))
  // 10 tabs in one scrolling row: each at least 44px, the first ones fit, the next one peeks in at the edge
  const cells = await p.locator('[role=tab]').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height, clipped: e.scrollWidth > e.clientWidth + 1 } }))
  const list = await p.evaluate(() => { const e = document.querySelector('[role=tablist]'); return { sw: e.scrollWidth, cw: e.clientWidth, sb: getComputedStyle(e).scrollbarWidth } })
  ok(list.sw > list.cw + 20 && list.sb === 'none', `tab row scrolls, no scrollbar (content ${list.sw}, width ${list.cw})`)
  ok(cells.length === 10 && cells.every(c => c.h >= 44 && c.w >= 44 && !c.clipped && Math.abs(c.w - cells[0].w) < 1.5), '10 tabs, equal width, at least 44px, labels not clipped')
  ok(cells.filter(c => c.x >= -0.5 && c.x + c.w <= 390.5).length >= 5 && cells.some(c => c.x < 390 && c.x + c.w > 390.5), 'at least 5 tabs fully visible and the next one peeks in')
  ok(await p.getByTestId('tabs-prev').count() === 0 && await p.getByTestId('tabs-next').count() === 0, 'no chevrons')
  await p.screenshot({ path: out + '/t-start.png' })
  const cdp = await ctx.newCDPSession(p)
  const top0 = await snapTop(p)
  const ty = await p.getByTestId('tab-water').evaluate(e => Math.round(e.getBoundingClientRect().top + 25))
  // vertical drag that starts on the tab row still moves the sheet
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: ty }] })
  for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: ty - 18 * i }] }); await p.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(p)
  ok(await snapTop(p) < top0 - 100, 'vertical drag starting on the tab row moves the sheet')
  // selecting a tab: one tap, no menu; nothing moves
  await p.evaluate(() => { document.querySelector('[role=tablist]').scrollLeft = 0 })
  await p.getByTestId('tab-bizi').tap(); await settle(p)
  ok(await p.getByTestId('tab-bizi').getAttribute('aria-selected') === 'true' && await p.locator('.mk').count() > 0, 'Bizi: one tap selects it and draws its markers')
  const sel = await p.evaluate(() => { const l = document.querySelector('[role=tablist]').getBoundingClientRect(), t = document.querySelector('[data-testid=tab-bizi]').getBoundingClientRect(); return { left: t.left - l.left, right: t.right - l.left, w: l.width } })
  ok(sel.left >= -1 && sel.right <= sel.w + 1, `the selected tab is scrolled fully into view (${Math.round(sel.left)}..${Math.round(sel.right)} of ${Math.round(sel.w)})`)
  await p.getByTestId('tab-libraries').tap(); await settle(p)
  ok(await p.getByTestId('tab-libraries').getAttribute('aria-selected') === 'true' && await p.getByTestId('list').count() === 1, 'Libraries is a normal tab with its own list')
  await p.getByTestId('tab-water').tap(); await settle(p)
  // Settings page in Spanish
  await p.getByTestId('open-settings').tap(); await settle(p)
  ok(await p.getByRole('heading', { name: 'Ajustes' }).count() === 1, 'Settings page titled Ajustes')
  ok(await p.getByTestId('row-language').count() === 1 && await p.getByTestId('row-about').count() === 1, 'Settings has Language and About')
  ok(await p.getByRole('button').filter({ hasText: /Biblioteca|Bizi/ }).count() === 0, 'Settings does not hold Libraries or Bizi')
  await p.screenshot({ path: out + '/t-settings-es.png' })
  // no English left in the chrome, on every page
  const EN = /\b(Nearest|Walk there|Details|Settings|Open now|Closed now|Show more|Use my location|Selected|Wrong or missing|Data refreshed|Zoom in|Zoom out|Expand or collapse|Language|Back|Close|Sources)\b/
  const text = async () => (await p.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.title || '')).join(' ')))
  const leaks = []
  const scan = async name => { const m = (await text()).match(EN); if (m) leaks.push(name + ':' + m[0]) }
  await scan('settings')
  await p.getByTestId('row-language').tap(); await settle(p); await scan('language')
  await p.getByTestId('back').tap(); await settle(p)
  await p.getByTestId('row-about').tap(); await settle(p); await scan('about')
  await p.getByTestId('back').tap(); await settle(p); await p.getByTestId('back').tap(); await settle(p)
  for (const id of ['water', 'toilets', 'charge', 'wifi', 'libraries', 'bizi', 'racks']) { await p.getByTestId('tab-' + id).tap(); await settle(p); await scan(id) }
  await p.getByTestId('details').tap(); await settle(p); await scan('details')
  ok(leaks.length === 0, 'no English left in Spanish mode ' + JSON.stringify(leaks))
  // Language choice persists, and the html lang follows
  await p.getByTestId('back').tap(); await settle(p)
  await p.getByTestId('open-settings').tap(); await p.getByTestId('row-language').tap(); await p.getByTestId('lang-en').tap(); await settle(p)
  ok(await p.evaluate(() => document.documentElement.lang) === 'en', 'choosing English sets html lang')
  await p.reload(); await ready(p)
  ok(await p.evaluate(() => document.documentElement.lang) === 'en', 'the choice persists after reload')
  await ctx.close()
})
// ---- narrow desktop window with a mouse ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 600, height: 800 }, false)
  const t0 = await snapTop(p)
  await p.mouse.move(300, t0 + 12); await p.mouse.down(); await p.mouse.move(300, t0 + 200, { steps: 12 }); await p.mouse.up(); await settle(p)
  ok(await snapTop(p) > t0 + 100, `600x800 mouse drag down from the handle lowers the sheet (${t0} -> ${await snapTop(p)})`)
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) < t0, 'handle click opens it again')
  await p.screenshot({ path: out + '/n-600.png' })
  await ctx.close()
})
// ---- drawer timings ----
late.push(async () => {
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
  await settle(p)
  await p.getByTestId('open-settings').click()
  const f = await p.evaluate(() => { const el = document.querySelector('.page-in'); const cs = getComputedStyle(el); return { dur: cs.animationDuration, name: cs.animationName } })
  console.log('page fade:', JSON.stringify(f))
  ok(f.dur === '0.3s', 'page fade 300ms')
  await ctx.close()
})
// ---- reduced motion ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { reducedMotion: 'reduce' })
  await p.getByTestId('open-settings').click()
  const f = await p.evaluate(() => { const el = document.querySelector('.page-in'); return getComputedStyle(el).animationName })
  console.log('reduced-motion page animation:', f)
  await ctx.close()
})
// ---- red only on interactive elements and titles (computed colour scan) ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await p.getByTestId('handle').click(); await settle(p)
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
  await p.getByTestId('handle').click(); await settle(p)
  await p.screenshot({ path: out + '/m-full.png' })
  const sc = await p.evaluate(() => { const v = document.querySelector('[data-testid=scroll]'); v.scrollTop = 300; return v.scrollTop })
  ok(sc > 0, 'list scrolls at full')
  await ctx.close()
})
// ---- desktop ----
todo.push(async () => {
  const { ctx, p, blocked } = await open({ width: 1280, height: 800 }, false)
  ok(blocked.length === 0, 'desktop: no non-tile requests')
  const w = await p.getByTestId('panel').evaluate(e => e.getBoundingClientRect().width)
  ok(w === 400, 'desktop panel 400px')
  await p.screenshot({ path: out + '/d-water.png' })
  for (const id of ['toilets', 'charge', 'wifi', 'water']) { await p.getByTestId('tab-' + id).click(); await settle(p); ok(await markers(p) > 0, `desktop ${id} renders`) }
  await p.getByTestId('tab-libraries').click(); await settle(p)
  await p.screenshot({ path: out + '/d-libs.png' })
  await ctx.close()
})
// run the blocks in a pool (half the cores), then the timing-sensitive ones alone
const pool = async (jobs, n) => { const q = [...jobs]; await Promise.all(Array.from({ length: n }, async () => { for (let j; (j = q.shift());) await j() })) }
const t0 = Date.now()
await pool(todo, Math.max(2, Math.floor(os.cpus().length / 2)))
await pool(late, 1)
console.log(`checks took ${((Date.now() - t0) / 1000).toFixed(1)}s`)
await b.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
