// Browser check: node e2e/check.mjs [url]   (needs `playwright` installed and the app served, e.g. npm run build && npx vite preview --port 4173)
// - blocks every request except the app itself and map tiles (the app must work with no data API)
// - every layer renders markers; Water works; every control is tapped; drawer timings are measured
import fs from 'node:fs'
import os from 'node:os'
import { chromium, devices } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/'
const out = process.env.SHOTS || '/tmp/zgz-pw'
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const b = await chromium.launch()
const todo = [], late = [] // each block below is independent (own browser context): `todo` blocks run in parallel, `late` (timing measurements) alone afterwards
// CityBikes is mocked (the real feed changes every minute): one station per bundled Bizi place, counts from its position in the list.
// Station names are as the real feed writes them ("8-Puerta del Sol"), the stamp as the real feed writes it ("...+00:00Z").
const BIZI = JSON.parse(fs.readFileSync([process.env.APP_DIR, process.cwd(), '/Users/faka/code/projects/web/zaragoza/maps-free-services/app'].filter(Boolean).map(d => d + '/src/data/bizi.json').find(f => fs.existsSync(f)), 'utf8')).rows
const feedAt = (ms, bikes = i => (i % 5 === 0 ? 0 : i % 9), docks = i => (i * 3) % 11) => ({ network: { stations: BIZI.map((r, i) => ({
  name: r[1].replace(/^(\d+)- ?/, '$1-'), latitude: r[2], longitude: r[3], free_bikes: bikes(i), empty_slots: docks(i), timestamp: new Date(ms).toISOString().replace('Z', '+00:00Z'),
  extra: { ebikes: i % 3 ? 1 : 0, renting: true, returning: true } })) } })
// mode: 'ok' (fresh), 'empty' (no bikes anywhere), 'stale' (stamps 10 min old), 'fail' (HTTP 500)
async function open(vp, mobile, extra = {}, lang = 'en', o = {}) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, locale: 'en-US', timezoneId: 'Europe/Madrid', serviceWorkers: 'block', ...extra })
  if (lang) await ctx.addInitScript(l => { if (!localStorage.getItem('zgz:v2:lang')) localStorage.setItem('zgz:v2:lang', l) }, lang)
  // the app opens on the seasonal default layer (Calor in the cold months, often empty at night); these checks start on toilets
  if (o.layer !== null) await ctx.addInitScript(l => { if (!localStorage.getItem('zgz:v2:layer')) localStorage.setItem('zgz:v2:layer', l) }, o.layer || 'toilets')
  if (o.geo) await ctx.addInitScript(g => { // a scripted location answer: the permission stays "prompt" until the first ask
    window.__geoCalls = 0; window.__ev = []
    window.goatcounter = { count: e => window.__ev.push(e.path) }
    navigator.permissions.query = async () => ({ state: g === 'blocked' ? 'denied' : 'prompt', addEventListener() {}, removeEventListener() {} })
    navigator.geolocation.getCurrentPosition = (ok, err) => { window.__geoCalls++; setTimeout(() => (g === 'grant' ? ok({ coords: { latitude: 41.6488, longitude: -0.8891 } }) : err({ code: 1 })), 30) }
  }, o.geo)
  const p = await ctx.newPage()
  const mock = { mode: 'ok', hits: 0 }
  const blocked = []
  p.on('pageerror', e => { fails++; console.log('FAIL pageerror', e.message) })
  await p.route('**/*', r => {
    const u = r.request().url()
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue()
    if (u.includes('server.arcgisonline.com')) return r.continue()
    if (u.startsWith('https://api.citybik.es/')) {
      mock.hits++
      if (mock.mode === 'fail') return r.fulfill({ status: 500, body: 'no' })
      const ms = Date.now() - (mock.mode === 'stale' ? 10 * 60_000 : 0)
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(feedAt(ms, mock.mode === 'empty' ? () => 0 : undefined)) })
    }
    blocked.push(u); return r.abort()
  })
  if (o.clock) await p.clock.install({ time: Date.now() })
  await p.goto(URL); await ready(p)
  return { ctx, p, blocked, mock }
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
// Equal columns, 44 px tall, no clipped label, and the page does not scroll sideways.
const fits = (p, sel) => p.evaluate(s => {
  const es = [...document.querySelectorAll(s)]
  if (!es.length) return false
  const r = es.map(e => e.getBoundingClientRect())
  return es.every((e, i) => r[i].height >= 43.5 && e.scrollWidth <= e.clientWidth + 1 && r[i].left >= -0.5 && r[i].right <= innerWidth + 0.5 && Math.abs(r[i].width - r[0].width) < 1.5) && document.documentElement.scrollWidth <= innerWidth
}, sel)
const markers = p => p.locator('.mk').count()
// A service chip only shows for the active goal: open its goal first if the chip is hidden (at most 2 taps), then the chip.
const GOAL_OF = { toilets: 'now', water: 'now', pharmacy: 'now', shelter: 'now', bus: 'move', tram: 'move', cercanias: 'move', bizi: 'move', wifi: 'connect', charge: 'connect', libraries: 'connect' }
const go = async (p, id, how = 'click') => {
  if (!(await p.getByTestId('tab-' + id).isVisible())) { await p.getByTestId('goal-' + GOAL_OF[id])[how](); await settle(p) }
  await p.getByTestId('tab-' + id)[how]()
}
const snapTop = p => p.evaluate(() => Math.round(document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top))

// ---- mobile ----
todo.push(async () => {
  const { ctx, p, blocked } = await open({ width: 390, height: 844 }, true)
  ok(blocked.length === 0, `no non-tile network requests (${blocked.length})`)
  ok(await markers(p) > 0, 'toilets markers drawn')
  ok(await p.getByTestId('nearest-name').innerText() !== '', 'nearest toilet shown at once')
  for (const id of ['charge', 'wifi', 'water', 'toilets']) {
    await go(p, id); await settle(p)
    ok(await markers(p) > 0, `layer ${id} renders markers`)
    ok(await p.getByTestId('nearest-name').count() === 1, `layer ${id} shows nearest`)
  }
  // tapping another tab at peek keeps the sheet at peek (the nearest-place card is already in view)
  ok(await snapTop(p) > 380 && await snapTop(p) < 660, `tab tap at peek keeps peek (top ${await snapTop(p)})`)
  // handle cycles peek -> full -> peek
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) < 120, 'handle goes to full')
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) > 380, 'handle goes to peek')
  await p.getByTestId('handle').click(); await settle(p) // full again: the controls below need room
  // Open now switch persisted
  const sw = p.getByTestId('switch-open')
  ok(await sw.getAttribute('aria-checked') === 'true' || (await sw.getAttribute('data-checked')) !== null, 'Open now ON by default')
  await sw.click(); await p.reload(); await ready(p)
  await p.getByTestId('handle').click(); await settle(p) // reload starts at peek
  ok(await p.getByTestId('switch-open').getAttribute('aria-checked') === 'false', 'Open now OFF persisted after reload')
  await p.getByTestId('switch-open').click()
  // water has no switch
  await go(p, 'water', 'click'); await settle(p)
  ok(await p.getByTestId('switch-open').count() === 0, 'water: no Open now switch')
  // wifi: range switch and chips
  await go(p, 'wifi', 'click'); await settle(p)
  await p.getByTestId('switch-range').click(); await p.getByTestId('switch-range').click()
  for (const name of ['Public buildings', 'Cafés and bars', 'Other', 'All']) { await p.getByRole('radio', { name }).or(p.getByRole('button', { name })).first().click(); await settle(p) }
  // details page, back, escape
  await p.getByTestId('details').click(); await settle(p)
  ok(await p.getByTestId('back').last().count() === 1, 'details page opened in same drawer')
  ok(await p.getByRole('link', { name: /Report/ }).getAttribute('href').then(h => h.includes('openstreetmap.org/note')), 'report link')
  await p.keyboard.press('Escape'); await settle(p)
  ok(await p.getByTestId('back').last().count() === 0, 'Escape goes up a page')
  await p.getByTestId('details').click(); await settle(p)
  await p.getByTestId('back').last().click(); await settle(p)
  ok(await p.getByTestId('back').last().count() === 0, 'Back goes up a page')
  // More: libraries, bizi, language, about
  await go(p, 'libraries', 'click'); await settle(p)
  ok(await markers(p) > 0, 'libraries render')
  ok(await p.getByText(/Live occupancy|Occupancy not published/).count() > 0, 'library occupancy line honest')
  const pop = p.getByRole('button', { name: 'Why no numbers?' }).first()
  if (await pop.count()) { await pop.click(); await settle(p); ok(await p.getByText(/do not guess/).isVisible(), 'occupancy info popover opens'); await p.keyboard.press('Escape') }
  await p.screenshot({ path: out + '/m-libs.png' })
  ok(await p.getByTestId('tab-racks').count() === 0, 'no separate racks tab')
  await go(p, 'bizi', 'click'); await settle(p)
  ok(await markers(p) > 0, 'bizi locations render')
  await p.getByTestId('open-settings').click(); await settle(p)
  await p.screenshot({ path: out + '/m-settings.png' })
  await p.getByTestId('row-language').click(); await settle(p)
  await p.getByTestId('lang-es').click(); await settle(p)
  ok(await p.getByText('Idioma').count() > 0, 'Spanish applied')
  await p.getByTestId('back').last().click(); await settle(p)
  ok(await p.getByTestId('row-about').count() === 1, 'language back to Settings')
  await p.getByTestId('row-about').click(); await settle(p)
  ok(await p.getByText(/Datos actualizados/).count() > 0, 'about shows data refreshed date')
  ok(await p.getByText(/sin relación con el Ayuntamiento/).count() > 0, 'disclaimer')
  await p.screenshot({ path: out + '/m-about.png' })
  await p.getByTestId('back').last().click(); await settle(p)
  ok(await p.getByTestId('row-about').count() === 1, 'About opened from Settings: Back returns to Settings')
  await p.getByTestId('close').last().click(); await settle(p)
  ok(await p.getByTestId('settings-view').count() === 0, 'the cross on Settings closes the view')
  await p.getByTestId('open-settings').click(); await p.getByTestId('row-language').click(); await p.getByTestId('lang-en').click(); await p.getByTestId('close').last().click()
  await ctx.close()
})

// ---- drawer behaviour: real touch drags (CDP) at 390x844 ----
{
  const LEVEL = { closed: [700, 844], peek: [300, 660], full: [70, 110] }
  const lvl = async p => { const t = await snapTop(p); return Object.entries(LEVEL).find(([, [a, z]]) => t >= a && t <= z)?.[0] ?? 'top=' + t }
  const sess = async (h = 844) => {
    const o = await open({ width: 390, height: h }, true)
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
  // peek -> full by dragging the handle
  todo.push(async () => {
    const { ctx, p, drag } = await sess(560) // a short screen, so the page below the card is taller than the sheet
    await drag(195, 400, 100); ok(await lvl(p) === 'full', 'handle drag up: peek -> full')
    await p.screenshot({ path: out + '/g-full.png' })
    // full: content scrolls; a drag down while scrolled scrolls back; at the top the same drag lowers the sheet
    const sb = await p.getByTestId('scroll').boundingBox(), y0 = Math.round(sb.y + sb.height - 20), y1 = Math.round(sb.y + 20) // inside the scrolling part only
    await drag(195, y0, y1); ok(await scrollTop(p) > 20 && await lvl(p) === 'full', 'full: content drag scrolls the list, sheet stays')
    await drag(195, y1, y1 + 40, 200); ok(await lvl(p) === 'full', `full: drag down while scrolled does not move the sheet (${await lvl(p)}, scroll ${await scrollTop(p)})`)
    await p.evaluate(() => { document.querySelector('[data-testid=scroll]').scrollTop = 0 })
    await drag(195, 300, 480); { const t = await snapTop(p); ok(t > 130 && t < 520, `full: drag down at the top hands the gesture to the sheet (-> top ${t}, peek on this short screen)`) }
    await ctx.close()
  })
  // down to closed and back
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 500, 150); ok(await lvl(p) === 'full', 'to full')
    await drag(195, 150, 600, 300); ok(await lvl(p) === 'peek', 'full -> peek by dragging down')
    await drag(195, 520, 780, 300); ok(await lvl(p) === 'closed', 'peek -> closed by dragging down')
    await p.screenshot({ path: out + '/g-closed.png' })
    const vis = await p.evaluate(() => { const r = n => document.querySelector(`[data-testid=${n}]`).getBoundingClientRect(); return { tab: r('goal-now').bottom, more: r('goal-connect').bottom, h: innerHeight, handle: r('handle') } })
    ok(vis.tab <= vis.h && vis.more <= vis.h, `closed: all goal tabs on screen (bottom ${Math.round(vis.tab)} of ${vis.h})`)
    ok(vis.handle.bottom <= vis.h && vis.handle.height >= 24 && vis.handle.width >= 44, 'closed: handle visible, at least 44 wide and 24 tall')
    ok(await p.getByTestId('scroll').evaluate(e => !!e.closest('[inert]')), 'closed: page body is inert (no focus off-screen)')
    ok(await p.locator('.mk').count() > 0 && (await p.getByTestId('map').boundingBox()).height === 844, 'closed: map fully visible')
    await p.getByTestId('goal-now').tap(); await settle(p)
    ok(await lvl(p) === 'peek', 'closed: tapping the goal tab opens to peek')
    ok(await p.getByTestId('tab-toilets').getAttribute('aria-selected') === 'true', 'and selects that layer')
    await p.getByTestId('goal-now').tap(); await settle(p); ok(await lvl(p) === 'closed', 'tapping the active goal tab at peek folds to closed')
    await p.getByTestId('handle').tap(); await settle(p); ok(await lvl(p) === 'peek', 'closed: handle tap opens the sheet')
    await ctx.close()
  })
  // flicks (velocity)
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 520, 380, 70); ok(await lvl(p) === 'full', `fast flick up from peek opens (${await lvl(p)})`)
    await drag(195, 200, 420, 70); ok(['peek', 'closed'].includes(await lvl(p)), `fast flick down from full lowers (${await lvl(p)})`)
    await ctx.close()
  })
  // map tap lowers the sheet
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 500, 150)
    ok(await lvl(p) === 'full', 'at full')
    await p.mouse.click(195, 40); await settle(p); ok(await lvl(p) === 'peek', 'map tap at full -> peek')
    await p.waitForTimeout(500)
    const pt = await bare(p); ok(!!pt, 'found a bare map spot')
    await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(300); await settle(p) // the first touch on the map after load is not a click in Leaflet (same before this change); warm it up
    if (await lvl(p) === 'closed') await p.getByTestId('handle').tap(), await settle(p)
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'closed', `map tap at peek -> closed (${await lvl(p)}, spot ${pt.x},${pt.y})`)
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'closed', 'map tap at closed stays closed')
    await ctx.close()
  })
  // marker selection shows the card above the sheet, at peek, on every layer
  todo.push(async () => {
    const { ctx, p } = await sess()
    for (const id of ['water', 'bus', 'wifi']) {
      await go(p, id, 'tap'); await settle(p)
      const before = await p.getByTestId('nearest-name').innerText()
      const mk = await p.evaluate(() => [...document.querySelectorAll('.mk:not(.sel)')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }).find(c => c.y > 80 && c.y < 400 && c.x > 20 && c.x < 370))
      ok(!!mk, `${id}: a marker is visible above the peek sheet`)
      if (!mk) continue
      await p.touchscreen.tap(mk.x, mk.y); await settle(p)
      ok(await lvl(p) === 'peek', `${id}: marker tap shows the card at peek`)
      ok(await p.getByTestId('nearest').getAttribute('aria-label') === 'Selected' && await p.getByTestId('nearest-name').innerText() !== before, `${id}: card shows the tapped place`)
      const sel = await p.evaluate(() => { const r = document.querySelector('.mk.sel').getBoundingClientRect(); return { bottom: r.bottom, top: r.top, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top } })
      ok(sel.bottom < sel.sheet - 4 && sel.top > 0, `${id}: selected marker sits above the sheet (marker bottom ${Math.round(sel.bottom)}, sheet top ${Math.round(sel.sheet)})`)
    }
    await p.screenshot({ path: out + '/g-marker.png' })
    await ctx.close()
  })
  // the next two nearest places are chips under the card; a tap selects
  todo.push(async () => {
    const { ctx, p } = await sess()
    ok(await p.getByTestId('nearby-item').count() === 2, 'two nearby chips under the card')
    ok(await p.getByTestId('list').count() === 0, 'no places list')
    const name = await p.getByTestId('nearby-item').first().innerText()
    await p.getByTestId('nearby-item').first().tap(); await settle(p)
    ok(await p.getByTestId('nearest').getAttribute('aria-label') === 'Selected' && name.includes(await p.getByTestId('nearest-name').innerText()), 'tap on a chip selects that place')
    ok(await lvl(p) === 'peek', 'and stays at peek')
    await ctx.close()
  })
  // page stack: About from the footer goes Back to the home page; Escape: page, then lower
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 500, 150)
    await p.evaluate(() => { const v = document.querySelector('[data-testid=scroll]'); v.scrollTop = v.scrollHeight })
    await p.getByRole('button', { name: 'About' }).tap(); await settle(p)
    ok(await p.getByTestId('close').count() === 1 && await p.getByTestId('back').count() === 0, 'About opens from the footer (a cross, no chevron: it is the first page)')
    await p.getByTestId('close').last().tap(); await settle(p)
    ok(await p.getByTestId('tab-water').count() === 1 && await p.getByTestId('row-about').count() === 0, 'About from footer: Close returns to home, not Settings')
    await p.getByTestId('open-settings').tap(); await p.getByTestId('row-about').tap(); await settle(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('row-about').count() === 1, 'Escape on About goes back to Settings')
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('tab-water').count() === 1, 'Escape on Settings goes back to home')
    const l0 = await lvl(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(l0 === 'full' && await lvl(p) === 'peek', `Escape on home lowers one step (${l0} -> ${await lvl(p)})`)
    await ctx.close()
  })
}

// ---- the Settings view: a full-screen view, not a page of the sheet ----
const view = async (opts = {}) => { const o = await open({ width: 390, height: 844 }, true, opts); await o.p.getByTestId('open-settings').tap(); await o.p.getByTestId('settings-view').waitFor(); await settle(o.p); return o }
todo.push(async () => { // a cross at the top right, on the spot of the Settings button; the title on the left; no chevron on the root
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  const fab = await p.getByTestId('open-settings').boundingBox()
  await p.getByTestId('open-settings').tap(); await p.getByTestId('settings-view').waitFor(); await settle(p)
  const x = await p.getByTestId('close').boundingBox(), h = await p.getByTestId('settings-view').getByRole('heading').boundingBox()
  ok(x.width >= 44 && x.height >= 44, `close cross is 44 px (${x.width}x${x.height})`)
  ok(Math.abs(x.x - fab.x) <= 1 && Math.abs(x.y - fab.y) <= 1, `close cross sits where the Settings button was (${Math.round(x.x)},${Math.round(x.y)} vs ${Math.round(fab.x)},${Math.round(fab.y)})`)
  ok(h.x < 100 && await p.getByTestId('back').count() === 0, 'title on the left, no back chevron on the root')
  ok(await p.getByTestId('settings-view').getAttribute('aria-modal') === 'true' && await p.evaluate(() => getComputedStyle(document.body).overflow) === 'hidden', 'view is modal and body scroll is locked')
  ok(await p.getByTestId('close').getAttribute('aria-label') === 'Close', 'cross is labelled Close')
  await p.getByTestId('close').last().tap(); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'open-settings', 'closing returns focus to the Settings button')
  ok(await p.evaluate(() => getComputedStyle(document.body).overflow) !== 'hidden', 'body scroll is free again')
  await ctx.close()
})
todo.push(async () => { // sub-page: the cross closes everything, the chevron and the back gesture go up one level
  const { ctx, p } = await view()
  await p.getByTestId('row-language').tap(); await p.getByTestId('view-language').waitFor(); await settle(p)
  ok(await p.getByTestId('view-language').getByTestId('close').count() === 1 && await p.getByTestId('view-language').getByTestId('back').count() === 1, 'sub-page has the cross and a small chevron')
  await p.goBack(); await p.getByTestId('view-language').waitFor({ state: 'detached' }); await settle(p)
  ok(await p.getByTestId('settings-view').count() === 1 && await p.getByTestId('row-about').count() === 1, 'browser back on a sub-page goes up one level')
  await p.goBack(); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  ok(await p.getByTestId('settings-view').count() === 0, 'browser back on the root closes the view')
  await ctx.close()
})
todo.push(async () => {
  const { ctx, p } = await view()
  await p.getByTestId('row-about').tap(); await p.getByTestId('view-about').waitFor(); await settle(p)
  await p.getByTestId('view-about').getByTestId('close').last().tap(); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  ok(await p.getByTestId('settings-view').count() === 0 && await p.evaluate(() => history.state?.zgz ?? 0) === 0, 'the cross on a sub-page closes the whole view and clears its history')
  await ctx.close()
})
todo.push(async () => { // the keyboard: focus is inside the view; Escape goes up one level
  const { ctx, p } = await view()
  ok(await p.evaluate(() => !!document.activeElement?.closest('[data-testid=settings-view]')), 'focus moves into the view')
  ok(await p.evaluate(() => document.getElementById('root').hasAttribute('inert')), 'the app behind is inert while the view is open')
  await p.keyboard.press('Escape'); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  ok(await p.getByTestId('settings-view').count() === 0, 'Escape closes the root view')
  await ctx.close()
})

// ---- goal tabs: fit, memory, order, reach ----
for (const [w, h, lang] of [[360, 740, 'es'], [360, 740, 'en'], [390, 844, 'es'], [390, 844, 'en']]) todo.push(async () => {
  const { ctx, p } = await open({ width: w, height: h }, true, {}, lang)
  for (const g of ['now', 'move', 'connect']) {
    await p.getByTestId('goal-' + g).tap(); await settle(p)
    ok(await fits(p, '[data-testid^=goal-]') && await fits(p, '[data-testid=services] [role=tab]'), `${w}px ${lang} goal ${g}: tabs and chips fit, equal columns, no sideways scroll`)
  }
  await ctx.close()
})
const reload = async p => { await p.reload(); await ready(p) }
for (const lang of ['en', 'es']) todo.push(async () => { // at peek the whole nearest-place card is on screen, for every service, in both languages (Spanish is longer)
  const { ctx, p } = await open({ width: 360, height: 740 }, true, {}, lang)
  for (const id of Object.keys(GOAL_OF)) {
    await p.evaluate(i => localStorage.setItem('zgz:v2:layer', i), id); await p.reload(); await p.waitForSelector('[data-testid=nearest],[data-testid=duty-loading],[data-testid=duty-failed]'); await settle(p)
    const gap = await p.evaluate(() => { const n = document.querySelector('[data-testid=nearest],[data-testid=duty-loading],[data-testid=duty-failed]'); return n ? Math.round(n.getBoundingClientRect().bottom - innerHeight) : 'none' })
    ok(gap !== 'none' && gap <= 0, `peek shows the whole nearest card on ${id} (${lang}, ${gap} px past the screen)`)
  }
  await ctx.close()
})
todo.push(async () => { // every service is reachable in at most 2 taps, from any other service
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  for (const id of Object.keys(GOAL_OF)) {
    const before = await p.getByTestId('tab-' + id).isVisible() ? 1 : 2
    await go(p, id, 'tap'); await settle(p)
    ok(before <= 2 && await p.getByTestId('tab-' + id).getAttribute('aria-selected') === 'true', `${id}: selected in ${before} tap(s)`)
  }
  ok(await p.locator('[data-testid=services] [role=tab]').count() <= 4, 'a goal shows at most 4 chips')
  await ctx.close()
})
todo.push(async () => { // each goal remembers its last service
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await go(p, 'charge', 'tap'); await settle(p)
  await p.getByTestId('goal-now').tap(); await settle(p)
  ok(await p.getByTestId('tab-toilets').getAttribute('aria-selected') === 'true', 'Now keeps its own last service (Toilets)')
  await p.getByTestId('goal-connect').tap(); await settle(p)
  ok(await p.getByTestId('tab-charge').getAttribute('aria-selected') === 'true', 'Connect comes back on Charge, not WiFi')
  await reload(p)
  ok(await p.getByTestId('tab-charge').getAttribute('aria-selected') === 'true', 'the last service survives a reload')
  await ctx.close()
})
todo.push(async () => { // goal order comes from tap counts, decided when the app opens; it never moves during a session
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  const order = () => p.locator('[data-testid^=goal-]').evaluateAll(es => es.map(e => e.getAttribute('data-testid').slice(5)))
  ok(JSON.stringify(await order()) === JSON.stringify(['now', 'move', 'connect']), 'new visitor: Now, Getting around, Connect')
  for (let i = 0; i < 4; i++) { await p.getByTestId('goal-connect').tap(); await settle(p); await p.getByTestId('goal-move').tap(); await settle(p) }
  await p.getByTestId('goal-connect').tap(); await settle(p)
  ok(JSON.stringify(await order()) === JSON.stringify(['now', 'move', 'connect']), 'the order does not change during the session')
  await reload(p)
  ok(JSON.stringify(await order()) === JSON.stringify(['connect', 'move', 'now']), 'after a reload the most tapped goals come first: ' + JSON.stringify(await order()))
  ok(await p.getByTestId('goal-connect').evaluate(e => e.getBoundingClientRect().left) < await p.getByTestId('goal-move').evaluate(e => e.getBoundingClientRect().left), 'and the first goal is the leftmost')
  await ctx.close()
})
todo.push(async () => { // events: a real switch sends tab (with the layer id); the same tab again sends nothing
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'en', { geo: 'blocked' })
  await go(p, 'wifi', 'tap'); await settle(p); await go(p, 'wifi', 'tap'); await settle(p)
  const ev = await p.evaluate(() => window.__ev)
  ok(ev.filter(e => e === 'tab-wifi').length === 1 && ev.includes('goal-connect'), 'events: one tab-wifi and goal-connect ' + JSON.stringify(ev))
  await ctx.close()
})
todo.push(async () => { // events for Settings: open, the way it closes, and a language change
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'en', { geo: 'blocked' })
  const ev = () => p.evaluate(() => window.__ev)
  await p.getByTestId('open-settings').tap(); await p.getByTestId('settings-view').waitFor(); await settle(p)
  await p.getByTestId('row-language').tap(); await p.getByTestId('view-language').waitFor(); await settle(p)
  await p.getByTestId('lang-es').tap(); await settle(p)
  await p.getByTestId('close').last().tap(); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  await p.getByTestId('open-settings').tap(); await p.getByTestId('settings-view').waitFor(); await settle(p)
  await p.keyboard.press('Escape'); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  await p.getByTestId('open-settings').tap(); await p.getByTestId('settings-view').waitFor(); await settle(p)
  await p.goBack(); await p.getByTestId('settings-view').waitFor({ state: 'detached' })
  const e = await ev()
  ok(JSON.stringify(e) === JSON.stringify(['settings-open', 'lang-es', 'settings-close-x', 'settings-open', 'settings-close-escape', 'settings-open', 'settings-close-back']), 'settings events: ' + e.join(','))
  await ctx.close()
})
todo.push(async () => { // the place-selected moment: a ring on the marker only when a person picks it
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  ok(await p.locator('.mk.pulse').count() === 0, 'no pulse on load or on the nearest card')
  await p.locator('.mk').first().click({ force: true }); await p.waitForSelector('.mk.pulse', { timeout: 2000 })
  await p.waitForSelector('.mk.pulse', { state: 'detached', timeout: 2000 })
  ok(true, 'a picked marker pulses once, then the class is gone')
  await ctx.close()
})

// ---- bus stops and duty pharmacies ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await go(p, 'bus', 'tap'); await settle(p)
  ok(await markers(p) > 500, 'Bus: stops are drawn')
  const next = p.getByTestId('next-buses')
  ok(await next.count() === 1 && /poste=\d+/.test(await next.getAttribute('href') || ''), 'Bus card: one Next buses link to the bus company page')
  ok(await p.getByTestId('bus-lines').count() === 1 && await p.getByTestId('walk').count() >= 1, 'Bus card: shows the lines and a Walk button')
  await ctx.close()
})
// tram: the stop card shows the line, both ends, one link to the tram company, and the track is drawn
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'tram' })
  await p.waitForSelector('[data-testid=tram-info]'); await settle(p)
  const info = await p.getByTestId('tram-info').innerText()
  ok(/T1/.test(info) && /Parque Goya/.test(info) && /Valdespartera/.test(info), `tram card: line and both ends (${info.replace(/\n/g, ' ')})`)
  ok(/tranviasdezaragoza\.es/.test(await p.getByTestId('tram-times').getAttribute('href') || ''), 'tram card: one link to the tram company times')
  ok(await markers(p) >= 10, 'tram: the stops are drawn')
  ok(await p.getByTestId('nearest').innerText().then(x => !/en vivo/i.test(x) || /\d+ min|Ahora/.test(x)), 'tram card claims live only when it shows minutes')
  await p.screenshot({ path: out + '/tram-es.png' })
  await ctx.close()
})
// Cercanias: the next 3 planned trains, labelled as not real time, with the date of the data and a Renfe link
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'cercanias' })
  await p.waitForSelector('[data-testid=train-row]'); await settle(p)
  const n = await p.getByTestId('train-row').count()
  ok(n >= 1 && n <= 3, `cercanias: ${n} next trains shown (1 to 3)`)
  const rows = await p.getByTestId('train-row').allInnerTexts()
  ok(rows.every(r => /\d\d:\d\d/.test(r) && /\ba /.test(r)), `cercanias: each row has a time and a destination (${rows.join(' | ').replace(/\n/g, ' ')})`)
  const note = await p.getByTestId('train-planned').innerText()
  ok(/Horario programado \(no es tiempo real\)/.test(note) && /\d\d\/\d\d\/\d{4}/.test(note), `cercanias: planned label and data date (${note})`)
  ok(/renfe\.com/.test(await p.getByTestId('train-times').getAttribute('href') || ''), 'cercanias: Renfe link')
  await p.screenshot({ path: out + '/cercanias-es.png' })
  await ctx.close()
})
// a bus line: tap a line chip on the stop card, the route replaces the markers, the sheet shows the stepper; back returns
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'bus' })
  await p.waitForSelector('[data-testid=bus-line-chip]'); await settle(p)
  const rows = await p.getByTestId('bus-lines').evaluate(e => new Set([...e.querySelectorAll('li')].map(l => Math.round(l.getBoundingClientRect().top))).size)
  ok(rows <= 2, `bus card: the line chips take at most 2 rows (${rows})`)
  { const r = await p.getByTestId('bus-line-chip').first().boundingBox(); ok(r.height >= 43.5 && r.width >= 40, `bus line chips are touch sized (${r.width}x${r.height})`) }
  const chip = p.getByTestId('bus-line-chip').first(), line = await chip.getAttribute('data-line')
  await chip.tap(); await settle(p)
  ok(await p.getByTestId('line-block').count() === 1 && await p.getByTestId('nearest').count() === 0, 'tapping a line shows the line sheet in place of the stop card')
  const title = await p.getByTestId('line-title').innerText()
  ok(new RegExp(`^Línea ${line}( · hacia .+)?$`).test(title), `title says the line and where it goes (${title})`)
  ok(await p.evaluate(() => window.__ev.includes('bus-line-' + document.querySelector('[data-testid=line-title]').textContent.split(' ')[1])), 'event bus-line-<line> sent: ' + await p.evaluate(() => window.__ev.join(',')))
  ok(await markers(p) === 0, 'line mode: the stop markers are replaced by the route')
  ok(await p.getByTestId('line-steps').locator('li').count() >= 2 && await p.getByTestId('line-steps').locator('li[data-here]').count() === 1, 'the stepper lists the stops in order, this stop first')
  ok((await p.getByTestId('next-buses').getAttribute('href') || '').includes('poste='), 'Próximos buses link is on the line sheet')
  // the route is on the canvas and fully above the sheet
  const px = await p.evaluate(() => {
    const c = document.querySelector('.leaflet-overlay-pane canvas'), g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data
    let top = h, bottom = -1
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 0) { if (y < top) top = y; if (y > bottom) bottom = y }
    const r = c.getBoundingClientRect(), k = r.height / h
    return { top: r.top + top * k, bottom: r.top + bottom * k, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top }
  })
  ok(px.bottom > 0 && px.bottom < px.sheet && px.top >= 0, `the whole route is drawn above the sheet (route ${Math.round(px.top)}..${Math.round(px.bottom)}, sheet top ${Math.round(px.sheet)})`)
  await p.screenshot({ path: out + '/bus-line-es.png' })
  if (await p.getByTestId('line-dir').count()) {
    await p.getByTestId('line-dir').tap(); await settle(p)
    ok(await p.getByTestId('line-title').innerText() !== title, 'the direction button shows the other direction')
  }
  await p.getByTestId('line-back').tap(); await settle(p)
  ok(await p.getByTestId('line-block').count() === 0 && await p.getByTestId('nearest').count() === 1 && await markers(p) > 100, 'back returns to the nearest stop and its markers')
  await ctx.close()
})
const farm = (date, hours = '09:00-22:00') => ({ result: [{ id: 'x1', title: 'Farmacia Test', geometry: { type: 'Point', coordinates: [-0.8773, 41.6488] }, calle: 'Calle Test 1', telefonos: '976000000', guardia: { fecha: date, horario: hours, sector: 'Centro' } }] })
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { serviceWorkers: 'block' })
  await p.route('**/farmacia.json*', r => r.fulfill({ status: 500, body: 'no' }))
  await go(p, 'pharmacy', 'tap'); await settle(p)
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
  ok(await p.title() === 'Zaragoza a mano · Lo que necesitas, cerca de ti', 'page title in Spanish')
  const man = await p.evaluate(() => fetch('/manifest.webmanifest').then(r => r.json()))
  ok(man.lang === 'es' && man.name === 'Zaragoza a mano', `manifest lang es (${man.lang}, ${man.name})`)
  // goal tabs: 3 equal columns, no scrolling; chips: the goal's services, equal columns, no scrolling (Spanish labels are the longest)
  const goals = await p.locator('[data-testid^=goal-]').allInnerTexts()
  ok(JSON.stringify(goals) === JSON.stringify(['Ahora', 'Moverse', 'Conectar']), 'goal tabs (no taps yet, default order): ' + goals.join(' | '))
  const chips = await p.locator('[data-testid=services] [role=tab]').allInnerTexts()
  ok(JSON.stringify(chips.filter(l => l !== 'Calor')) === JSON.stringify(['Aseos', 'Agua', 'Farmacia']) && chips.length === 4, 'Ahora chips (Calor 3rd in its season, else last): ' + chips.join(' | '))
  ok(await p.getByTestId('tab-toilets').getAttribute('aria-selected') === 'true', 'first visit: Ahora > Toilets is selected')
  ok(await fits(p, '[data-testid^=goal-]') && await fits(p, '[data-testid=services] [role=tab]'), 'goal tabs and chips: equal columns, at least 44 tall, labels not clipped, no sideways scroll')
  ok(await p.locator('[role=tab]').count() >= 6 && await p.getByTestId('tabs-prev').count() === 0, 'no chevrons')
  await p.screenshot({ path: out + '/t-start.png' })
  const cdp = await ctx.newCDPSession(p)
  const top0 = await snapTop(p)
  const ty = await p.getByTestId('tab-water').evaluate(e => Math.round(e.getBoundingClientRect().top + 25))
  // vertical drag that starts on the tab row still moves the sheet
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: ty }] })
  for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: ty - 18 * i }] }); await p.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(p)
  ok(await snapTop(p) < top0 - 100, 'vertical drag starting on the tab row moves the sheet')
  // selecting a service: the goal tab, then the chip
  await go(p, 'bizi', 'tap'); await settle(p)
  ok(await p.getByTestId('tab-bizi').getAttribute('aria-selected') === 'true' && await p.locator('.mk').count() > 0, 'Bizi: goal tab then chip draws its markers')
  await go(p, 'libraries', 'tap'); await settle(p)
  ok(await p.getByTestId('tab-libraries').getAttribute('aria-selected') === 'true' && await p.getByTestId('nearby-item').count() === 2, 'Libraries is a normal tab with its nearest card and two nearby chips')
  await go(p, 'water', 'tap'); await settle(p)
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
  await p.getByTestId('back').last().tap(); await settle(p)
  await p.getByTestId('row-about').tap(); await settle(p); await scan('about')
  await p.getByTestId('back').last().tap(); await settle(p); await p.getByTestId('close').last().tap(); await settle(p)
  for (const id of ['water', 'toilets', 'charge', 'wifi', 'libraries', 'bizi']) { await go(p, id, 'tap'); await settle(p); await scan(id) }
  await p.getByTestId('details').tap(); await settle(p); await scan('details')
  ok(leaks.length === 0, 'no English left in Spanish mode ' + JSON.stringify(leaks))
  // Language choice persists, and the html lang follows
  await p.getByTestId('back').last().tap(); await settle(p)
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
  ok(await snapTop(p) < await p.evaluate(() => innerHeight) - 60, 'handle click opens it again')
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
  console.log('measured snap peek->full:', JSON.stringify(m))
  ok(Math.abs(m.transformMs - 450) < 60, `measured transform ${m.transformMs}ms ~ 450ms`)
  await settle(p)
  await ctx.close()
})
// Frames of the Settings view while it opens: its x position and opacity, once per frame, from the tap until 500 ms later.
const openFrames = (p, ms = 500) => p.evaluate(ms => new Promise(res => {
  const t0 = performance.now(), fr = []
  const f = () => {
    const el = document.querySelector('[data-testid=settings-view]'), t = Math.round(performance.now() - t0)
    if (el) { const cs = getComputedStyle(el); fr.push({ t, x: Math.round(new DOMMatrixReadOnly(cs.transform).m41), o: +(+cs.opacity).toFixed(2) }) }
    if (t < ms) requestAnimationFrame(f); else res(fr)
  }
  document.querySelector('[data-testid=open-settings]').click(); requestAnimationFrame(f)
}), ms)
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  const fr = await openFrames(p)
  const first = fr[0], last = fr.at(-1), done = fr.find(f => f.x === 0)
  ok(first.x > 100 && last.x === 0, `Settings slides in from the right (x ${first.x} -> ${last.x})`)
  ok(fr.every((f, i) => i === 0 || f.x <= fr[i - 1].x), 'the slide only moves left, never back (no bounce)')
  ok(!!done && done.t - first.t >= 150 && done.t - first.t <= 330, `the slide takes about 260 ms (${done ? done.t - first.t : '?'} ms)`)
  await ctx.close()
})
// ---- reduced motion ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { reducedMotion: 'reduce' })
  const fr = await openFrames(p)
  ok(fr.every(f => f.x === 0) && fr.some(f => f.o < 1) && fr.at(-1).o === 1, 'reduced motion: Settings only fades, it never moves')
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
  // scroll handoff: at full, scrolling the page scrolls; drag down at top returns the drawer
  await p.screenshot({ path: out + '/m-full.png' })
  await ctx.close()
})
// ---- desktop ----
todo.push(async () => {
  const { ctx, p, blocked } = await open({ width: 1280, height: 800 }, false)
  ok(blocked.length === 0, 'desktop: no non-tile requests')
  const w = await p.getByTestId('panel').evaluate(e => e.getBoundingClientRect().width)
  ok(w === 400, 'desktop panel 400px')
  await p.screenshot({ path: out + '/d-water.png' })
  for (const id of ['toilets', 'charge', 'wifi', 'water']) { await go(p, id); await settle(p); ok(await markers(p) > 0, `desktop ${id} renders`) }
  await go(p, 'libraries', 'click'); await settle(p)
  await p.screenshot({ path: out + '/d-libs.png' })
  await ctx.close()
})
// ---- Bizi live counts (CityBikes mocked) ----
const listText = p => p.getByTestId('peek-block').innerText()
const biziTab = async p => { await go(p, 'bizi', 'tap'); await settle(p); await p.waitForSelector('[data-testid=bizi-status][data-state=live]') ; await settle(p) }
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  ok(mock.hits === 0, 'CityBikes is not called before the Bizi tab opens')
  await biziTab(p)
  ok(mock.hits >= 1, 'CityBikes is called when the Bizi tab opens')
  ok(/Live counts, updated \d\d:\d\d/.test(await p.getByTestId('bizi-status').innerText()), 'Bizi: status says the counts are live, with the time')
  const card = await p.getByTestId('bizi-counts').innerText()
  ok(/^\d+ bikes? \(\d+ electric\) · \d+ free docks?$|^\d+ bikes? · \d+ free docks?$/.test(card), `Bizi card shows bikes, e-bikes and free docks (${card})`)
  const chips = await p.getByTestId('bizi-bar').getByRole('button').allInnerTexts()
  ok(JSON.stringify(chips.slice(0, 3)) === JSON.stringify(['Take a bike', 'Return a bike', 'My bike']), 'Bizi: three chips ' + chips.join(' | '))
  ok(await p.getByTestId('bizi-bar').getByRole('button', { name: 'Take a bike' }).getAttribute('aria-pressed') === 'true', 'Take a bike is the default chip')
  const take = await listText(p)
  ok(/\d+ bikes?/.test(take) && !/\b0 bikes\b/.test(take), 'Take: the nearest card shows bikes, never a station with 0 bikes')
  await p.getByRole('button', { name: 'Return a bike' }).tap(); await settle(p)
  const ret = await listText(p)
  ok(/free docks?/.test(ret) && !/\b0 free docks\b/.test(ret), 'Return: the nearest card shows free docks, never 0')
  await p.getByRole('button', { name: 'My bike' }).tap(); await settle(p)
  ok(await markers(p) > 0 && !/ free docks?/.test(await listText(p)) && await p.getByTestId('bizi-status').count() === 0, 'My bike: the racks, no counts, no live status')
  await p.screenshot({ path: out + '/bizi-mine-en.png' })
  // counts change without animation
  await p.getByRole('button', { name: 'Take a bike' }).tap(); await settle(p)
  ok(await p.evaluate(() => document.getAnimations().length) === 0, 'no animation running after a chip change')
  await ctx.close()
})
todo.push(async () => { // the same tab in Spanish, with a screenshot
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es')
  await biziTab(p)
  ok(/Cifras en directo, actualizadas a las \d\d:\d\d/.test(await p.getByTestId('bizi-status').innerText()), 'ES: live status line')
  ok(/bicis?( \(.*\))? · \d+ anclajes? libres?/.test(await p.getByTestId('bizi-counts').innerText()), 'ES: card counts')
  ok(JSON.stringify((await p.getByTestId('bizi-bar').getByRole('button').allInnerTexts()).slice(0, 3)) === JSON.stringify(['Coger una bici', 'Dejar una bici', 'Mi bici']), 'ES chips')
  await p.screenshot({ path: out + '/bizi-es.png' })
  await ctx.close()
})
todo.push(async () => { // nothing in the list is wiped when the feed is down
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  mock.mode = 'fail'
  await go(p, 'bizi', 'tap'); await settle(p)
  await p.waitForSelector('[data-testid=bizi-status][data-state=failed]')
  ok(/Live counts unavailable/.test(await p.getByTestId('bizi-status').innerText()) && await p.getByTestId('bizi-retry').count() === 1, 'failed feed: "Live counts unavailable" and Try again')
  ok(await markers(p) > 0 && await p.getByTestId('nearby-item').count() === 2, 'failed feed: the places still show')
  ok(!/bikes? · /.test(await listText(p)), 'failed feed: no counts shown')
  await p.screenshot({ path: out + '/bizi-failed-en.png' })
  mock.mode = 'ok'; await p.getByTestId('bizi-retry').tap()
  await p.waitForSelector('[data-testid=bizi-status][data-state=live]')
  ok(/bikes?/.test(await listText(p)), 'Try again loads the counts')
  await ctx.close()
})
todo.push(async () => { // stale feed (stamps 10 minutes old) is never shown as live
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  mock.mode = 'stale'
  await go(p, 'bizi', 'tap'); await settle(p)
  await p.waitForSelector('[data-testid=bizi-status][data-state=failed]')
  ok(!/bikes? · /.test(await listText(p)) && !/Live counts, updated/.test(await p.locator('body').innerText()), 'stale feed: not shown as live')
  await ctx.close()
})
todo.push(async () => { // no station has a bike: show them all and say so
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  mock.mode = 'empty'
  await go(p, 'bizi', 'tap'); await settle(p)
  await p.waitForSelector('[data-testid=bizi-status][data-state=live]'); await settle(p)
  ok(await p.getByTestId('all-out').count() === 1 && await p.getByTestId('nearby-item').count() === 2, 'no bikes anywhere: the message plus all stations')
  await ctx.close()
})
todo.push(async () => { // cached counts older than 5 minutes are not live; the page makes no call while on another tab
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  await biziTab(p)
  const n = mock.hits
  await go(p, 'water', 'tap'); await settle(p)
  await p.evaluate(() => window.dispatchEvent(new Event('focus')))
  await p.waitForTimeout(300)
  ok(mock.hits === n, 'leaving the Bizi tab: no more CityBikes calls')
  await ctx.close()
})

// ---- location at the first moment of intent ----
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { permissions: [] }, 'en', { geo: 'grant', layer: null })
  ok(await p.evaluate(() => window.__geoCalls) === 0, 'location is not asked on load')
  await p.getByTestId('handle').click(); await settle(p)
  ok(await p.getByTestId('from-centre').innerText().then(t => /Distances from the city centre/.test(t)), 'before location: the page says distances are from the city centre')
  ok(await p.getByTestId('locate').count() === 1, 'before location: a Use my location button')
  await p.screenshot({ path: out + '/loc-before-en.png' })
  await go(p, 'water', 'tap'); await settle(p)
  ok(await p.evaluate(() => window.__geoCalls) === 1, 'the first tab tap asks for location once')
  await p.getByTestId('from-centre').waitFor({ state: 'detached' }); await settle(p)
  ok(await p.getByTestId('from-centre').count() === 0 && await p.getByTestId('locate').count() === 0, 'after location: the from-centre line and button are gone')
  await p.screenshot({ path: out + '/loc-after-en.png' })
  await go(p, 'toilets', 'tap'); await settle(p)
  ok(await p.evaluate(() => window.__geoCalls) === 1, 'later tab taps do not ask again')
  ok(await p.evaluate(() => window.__ev.includes('locate-granted')), 'event locate-granted sent: ' + await p.evaluate(() => window.__ev.join(',')))
  await ctx.close()
})
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'deny', layer: null })
  await go(p, 'water', 'tap'); await settle(p)
  await p.waitForSelector('[data-testid=loc-denied]', { state: 'attached' }); await p.getByTestId('handle').click(); await settle(p)
  ok(/desde el centro/.test(await p.getByTestId('from-centre').innerText()), 'denied: still ranked from the centre')
  ok(await p.getByTestId('locate').count() === 0 && await p.getByTestId('toast').count() === 0, 'denied: one calm line, no button, no toast')
  await go(p, 'toilets', 'tap'); await settle(p); await go(p, 'wifi', 'tap'); await settle(p)
  ok(await p.evaluate(() => window.__geoCalls) === 1, 'denied: not asked again on later taps')
  ok(await p.evaluate(() => window.__ev.filter(e => e === 'locate-denied').length) === 1, 'event locate-denied sent once')
  ok(!(await p.evaluate(() => window.__ev.join(','))).match(/-?\d+\.\d{3}/), 'events carry no coordinates')
  await p.screenshot({ path: out + '/loc-denied-es.png' })
  await ctx.close()
})
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'en', { geo: 'blocked', layer: null })
  await go(p, 'water', 'tap'); await settle(p)
  ok(await p.evaluate(() => window.__geoCalls) === 0 && await p.getByTestId('loc-denied').count() === 1, 'permission already denied: no ask, the calm line shows')
  await ctx.close()
})

// ---- install hint is for a real browser tab only ----
const hintAfterWalk = async ua => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { userAgent: ua })
  await p.getByTestId('walk').first().evaluate(a => { a.addEventListener('click', e => e.preventDefault(), true) })
  await p.getByTestId('walk').first().click(); await p.waitForTimeout(1800)
  const shown = (await p.locator('body').innerText()).includes('Add this app to your home screen')
  await ctx.close(); return shown
}
todo.push(async () => {
  ok(await hintAfterWalk('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36') === true, 'install hint shows in a normal Android Chrome tab')
  ok(await hintAfterWalk('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Reddit/Version 2024.20.0') === false, 'no install hint in the Reddit in-app browser')
  ok(await hintAfterWalk('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0') === false, 'no install hint in the Instagram in-app browser')
})
// ---- one run as a real Android Chrome (device emulation: UA, touch, DPR, no SW tricks) ----
todo.push(async () => {
  const d = devices['Pixel 7']
  const ctx = await b.newContext({ ...d, locale: 'en-US', serviceWorkers: 'block' })
  await ctx.addInitScript(() => { localStorage.setItem('zgz:v2:layer', 'toilets'); localStorage.setItem('zgz:v2:lang', 'en') })
  const p = await ctx.newPage(); const mock = { hits: 0 }
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith(URL.replace(/\/$/, '')) || u.startsWith('http://localhost')) return r.continue(); if (u.includes('arcgisonline')) return r.continue()
    if (u.startsWith('https://api.citybik.es/')) { mock.hits++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(feedAt(Date.now())) }) }
    return r.abort() })
  await p.goto(URL); await ready(p)
  ok(/Android/.test(await p.evaluate(() => navigator.userAgent)), 'Android Chrome UA emulation active')
  await go(p, 'bizi', 'tap'); await settle(p); await p.waitForSelector('[data-testid=bizi-status][data-state=live]')
  ok(/bikes?/.test(await p.getByTestId('peek-block').innerText()), 'Android: Bizi counts show')
  await go(p, 'pharmacy', 'tap'); await settle(p)
  ok(await p.getByTestId('tab-pharmacy').getAttribute('aria-selected') === 'true', 'Android: tab switch works by touch')
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Android: no sideways page scroll')
  await p.screenshot({ path: out + '/android.png' })
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
