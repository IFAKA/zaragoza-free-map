// Browser check: node e2e/check.mjs [url]   (needs `playwright` installed and the app served, e.g. npm run build && npx vite preview --port 4173)
// - blocks every request except the app itself and map tiles (the app must work with no data API)
// - every layer renders markers; Water works; every control is tapped; drawer timings are measured
import fs from 'node:fs'
import os from 'node:os'
import { chromium, devices } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4173/'
const out = process.env.SHOTS || '/tmp/zgz-pw'
// Touch floors. Design rule is 44 px, but html font-size is 15 px so 2.75rem = 41.25 (min-h-9 = 33.75); these floors catch shrinking, not the rem rounding.
const TOUCH = 40, TOUCH_ROW = 33
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ` (check.mjs:${/:(\d+):\d+\)?$/m.exec(new Error().stack.split('\n')[2])?.[1] ?? '?'})`)); if (!c) fails++ }
const b = await chromium.launch()
const DATA_TRAM_STOPS = JSON.parse(fs.readFileSync([process.env.APP_DIR, process.cwd()].filter(Boolean).map(d => d + '/src/data/tram.json').find(f => fs.existsSync(f)), 'utf8')).rows.length
const appJson = name => JSON.parse(fs.readFileSync([process.env.APP_DIR, process.cwd()].filter(Boolean).map(d => d + '/src/data/' + name).find(f => fs.existsSync(f)), 'utf8'))
const BUS = appJson('bus.json').rows, BUS_LINES = appJson('busroutes.json').lines
// the city's live answer for a bus stop, scripted: one arrival of a line that serves the stop and has a bundled route (only those rows open the route view), and one of another line
const busAnswer = u => { const id = /tuzsa-(\d+)\.json/.exec(u)?.[1], line = BUS.find(r => r[0] === id)?.[2].split(',').find(l => BUS_LINES[l]); return line ? { destinos: [{ linea: line, destino: 'CENTRO', primero: '3 minutos.', segundo: '11 minutos.' }, { linea: 'ZZ', destino: 'OTRA', primero: '1 minuto.', segundo: '' }] } : null }
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
  const mock = { mode: 'ok', hits: 0, city: null }
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
    if (u.startsWith('https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/') && mock.city) { // the city's live API, scripted by the test (otherwise blocked like every other data API)
      const j = mock.city(u)
      return j ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(j) }) : r.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, body: 'no' })
    }
    blocked.push(u); return r.abort()
  })
  if (o.clock) await p.clock.install({ time: Date.now() })
  await p.goto(URL); await ready(p)
  return { ctx, p, blocked, mock }
}
// Wait until the page stops moving: no running animation or transition, and the drawer, map and a marker hold still for 18 frames (the open height settles 250 ms after a page swap). Replaces fixed sleeps.
const settle = p => p.evaluate(() => new Promise(res => {
  const state = () => {
    const pop = document.querySelector('[data-slot=drawer-popup]'), mk = document.querySelector('.mk'), mp = document.querySelector('.leaflet-map-pane')
    const running = document.getAnimations().filter(a => a.playState === 'running').length
    return { running, sig: [pop?.getBoundingClientRect().top, mk?.getBoundingClientRect().x, mp?.style.transform].join('|') }
  }
  let last = '', same = 0, frames = 0
  const f = () => { const { running, sig } = state(); if (sig === last) same++; else { same = 0; last = sig } if ((same >= 18 && running === 0 && frames >= 8) || ++frames > 150) res(); else requestAnimationFrame(f) }
  f()
}))
// Resolves when the sheet's top edge has not moved for `ms`: after a page swap the sheet first holds the old page's height, then eases to the new one 250 ms later (settle() can return in between).
const still = (p, ms = 600) => p.evaluate(ms => new Promise(res => {
  const pop = document.querySelector('[data-slot=drawer-popup]'); let last = null, since = performance.now()
  const f = () => { const t = Math.round(pop.getBoundingClientRect().top); if (t !== last) { last = t; since = performance.now() } if (performance.now() - since >= ms) res(); else requestAnimationFrame(f) }
  f()
}), ms)
const ready = async p => { await p.waitForSelector('.mk'); await settle(p) }
// Equal columns, at least TOUCH px tall, no clipped label, and the page does not scroll sideways.
const fits = (p, sel) => p.evaluate(([s, TOUCH]) => {
  const es = [...document.querySelectorAll(s)]
  if (!es.length) return false
  const r = es.map(e => e.getBoundingClientRect())
  return es.every((e, i) => r[i].height >= TOUCH && e.scrollWidth <= e.clientWidth + 1 && r[i].left >= -0.5 && r[i].right <= innerWidth + 0.5 && Math.abs(r[i].width - r[0].width) < 1.5) && document.documentElement.scrollWidth <= innerWidth
}, [sel, TOUCH])
const markers = p => p.locator('.mk').count()
// Every service is one chip in one scrolling row (tap scrolls it into view). LAYER_IDS is the default order.
const LAYER_IDS = ['toilets', 'water', 'pharmacy', 'shelter', 'bus', 'tram', 'bizi', 'cercanias', 'wifi', 'charge', 'libraries']
// the home header shows the service on show; the others are on the Services page behind the 2x2 button
const go = async (p, id, how = 'click') => {
  if (!await p.getByTestId('tab-' + id).count()) { await p.getByTestId('services-open')[how](); await p.getByTestId('tab-' + id).waitFor(); await settle(p) }
  await p.getByTestId('tab-' + id)[how]()
}
const layerOn = p => p.evaluate(() => localStorage.getItem('zgz:v2:layer'))
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
  // the sheet has two states (closed, open at the height of its content): the handle toggles them
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) > 660, 'handle closes the sheet')
  await p.getByTestId('handle').click(); await settle(p)
  ok(await snapTop(p) < 660, 'handle opens it again')
  // Open now is no longer a filter (bca6d7b): there is no switch, closed places stay on the map greyed out
  ok(await p.getByTestId('switch-open').count() === 0, 'no Open now switch: closed places are always shown, greyed out')
  // wifi: the type chips are on the Filters page
  await go(p, 'wifi', 'click'); await settle(p)
  await p.getByTestId('filters-open').click(); await settle(p)
  for (const c of await p.getByTestId('filters').locator('[data-testid^=filter-]').evaluateAll(es => es.map(e => e.dataset.testid))) { await p.getByTestId(c).click(); await settle(p); ok(await p.getByTestId(c).getAttribute('aria-pressed') === 'true', `wifi filter ${c} selects`) }
  await p.getByTestId('back').last().click(); await settle(p)
  // details page, back, escape
  await p.getByTestId('details').click(); await settle(p)
  ok(await p.getByTestId('back').last().count() === 1, 'details page opened in same drawer')
  ok(await p.getByRole('link', { name: /Report/ }).count() === 0, 'details page: no Report link any more (the report button left it; feedback lives in Settings)')
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
  ok(await p.getByTestId('row-support').count() === 1, 'Settings has the Ko-fi support row')
  ok(await p.getByTestId('row-feedback').count() === 1, 'Settings has the Send feedback row')
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
  const LEVEL = { closed: [676, 844], open: [60, 675] } // two states since the sheet sizes itself to its content (closed = the header bar only)
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
  // a page taller than the screen: the open sheet takes the whole screen and its content scrolls (a landscape phone is 320-400 px high)
  todo.push(async () => {
    const { ctx, p, drag } = await sess(320)
    const top0 = await snapTop(p); ok(top0 <= 90, `short screen: the open sheet fills the screen (top ${top0})`)
    await p.screenshot({ path: out + '/g-full.png' })
    // content scrolls; a drag down while scrolled scrolls back; at the top the same drag lowers the sheet
    const sb = await p.getByTestId('scroll').boundingBox(), bar = await p.getByTestId('services-open').boundingBox() // the footer bar covers the bottom of the scroll area
    const y0 = Math.round(bar.y - 12), y1 = Math.round(sb.y + 8) // inside the visible scrolling part only
    await drag(195, y0, y1); ok(await scrollTop(p) > 10 && await snapTop(p) === top0, `open: content drag scrolls the list, sheet stays (scroll ${await scrollTop(p)}, top ${await snapTop(p)})`)
    await drag(195, y1, y1 + 40, 200); ok(await snapTop(p) === top0, `open: drag down while scrolled does not move the sheet (top ${await snapTop(p)}, scroll ${await scrollTop(p)})`)
    await p.evaluate(() => { document.querySelector('[data-testid=scroll]').scrollTop = 0 })
    await drag(195, y1, y1 + 150); { const t = await snapTop(p); ok(t > top0 + 40 && await p.getByTestId('scroll').evaluate(e => !!e.closest('[inert]')), `open: drag down at the top hands the gesture to the sheet, which closes (top ${t}, was ${top0})`) }
    await ctx.close()
  })
  // down to closed and back
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 690, 150); ok(await lvl(p) === 'open', 'drag up on the open sheet leaves it open')
    await drag(195, 650, 800, 300); ok(await lvl(p) === 'closed', 'open -> closed by dragging down')
    await p.screenshot({ path: out + '/g-closed.png' })
    const vis = await p.evaluate(() => { const r = n => document.querySelector(`[data-testid=${n}]`).getBoundingClientRect(); return { tab: r('services').bottom, h: innerHeight, handle: r('handle') } })
    ok(vis.tab <= vis.h, `closed: the chip row is on screen (bottom ${Math.round(vis.tab)} of ${vis.h})`)
    ok(vis.handle.bottom <= vis.h && vis.handle.height >= 24 && vis.handle.width >= 44, 'closed: handle visible, at least 44 wide and 24 tall')
    ok(await p.getByTestId('scroll').evaluate(e => !!e.closest('[inert]')), 'closed: page body is inert (no focus off-screen)')
    ok(await p.locator('.mk').count() > 0 && (await p.getByTestId('map').boundingBox()).height === 844, 'closed: map fully visible')
    await go(p, 'toilets', 'tap'); await settle(p); await still(p)
    ok(await lvl(p) === 'open', 'closed: picking a service on the Services page opens the sheet')
    ok(await layerOn(p) === 'toilets' && await p.getByTestId('services-open').count() === 1, 'and selects that layer, back on home')
    await go(p, 'toilets', 'tap'); await settle(p); await still(p); ok(await lvl(p) === 'open', 'picking the service on show keeps the sheet open')
        await drag(195, 650, 800, 300); ok(await lvl(p) === 'closed', `open -> closed again by dragging down (top ${await snapTop(p)})`)
    await p.getByTestId('handle').tap(); await settle(p); ok(await lvl(p) === 'open', `closed: handle tap opens the sheet (top ${await snapTop(p)})`)
    await drag(195, 650, 800, 300); ok(await lvl(p) === 'closed', 'closed again')
    await ctx.close()
  })
  // flicks (velocity)
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await drag(195, 620, 840, 70); ok(await lvl(p) === 'closed', `fast flick down from open closes (${await lvl(p)})`)
    await drag(195, 720, 380, 70); ok(await lvl(p) === 'open', `fast flick up from closed opens (${await lvl(p)})`)
    await ctx.close()
  })
  // map tap lowers the sheet
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    ok(await lvl(p) === 'open', 'starts open')
    await p.waitForTimeout(500)
    const pt = await bare(p); ok(!!pt, 'found a bare map spot')
    await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(300); await settle(p) // the first touch on the map after load is not a click in Leaflet (same before this change); warm it up
    if (await lvl(p) === 'closed') await p.getByTestId('handle').tap(), await settle(p)
    await p.touchscreen.tap(pt.x, pt.y); await settle(p); ok(await lvl(p) === 'closed', `map tap at open -> closed (${await lvl(p)}, spot ${pt.x},${pt.y})`)
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
      ok(await lvl(p) === 'open', `${id}: marker tap shows the card with the sheet open`)
      ok(await p.getByTestId('nearest').getAttribute('aria-label') === 'Selected' && await p.getByTestId('nearest-name').innerText() !== before, `${id}: card shows the tapped place`)
      const sel = await p.evaluate(() => { const r = document.querySelector('.mk.sel').getBoundingClientRect(); return { bottom: r.bottom, top: r.top, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top } })
      ok(sel.bottom < sel.sheet - 4 && sel.top > 0, `${id}: selected marker sits above the sheet (marker bottom ${Math.round(sel.bottom)}, sheet top ${Math.round(sel.sheet)})`)
    }
    await p.screenshot({ path: out + '/g-marker.png' })
    await ctx.close()
  })
  // page stack: About from Settings goes Back to Settings; Escape: page, then lower
  todo.push(async () => {
    const { ctx, p, drag } = await sess()
    await p.getByTestId('open-settings').tap(); await p.getByTestId('row-about').tap(); await settle(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('row-about').count() === 1, 'Escape on About goes back to Settings')
    await p.keyboard.press('Escape'); await settle(p)
    ok(await p.getByTestId('services-open').count() === 1, 'Escape on Settings goes back to home')
    const l0 = await lvl(p)
    await p.keyboard.press('Escape'); await settle(p)
    ok(l0 === 'open' && await lvl(p) === 'closed', `Escape on home lowers the sheet (${l0} -> ${await lvl(p)})`)
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

// ---- service chips: fit, order, reach ----
// 40 px chips with a 48 px tap area, labels not clipped, the row scrolls sideways but the page does not
const chipsFit = async p => {
  const head = await p.evaluate(TOUCH => { const b = document.querySelector('[data-testid=services-open]').getBoundingClientRect(); return b.height >= TOUCH && b.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth }, TOUCH)
  await p.getByTestId('services-open').tap(); await p.getByTestId('tab-bus').waitFor(); await settle(p)
  const page = await p.evaluate(TOUCH => { const es = [...document.querySelectorAll('[data-testid^=tab-]')], r = es.map(e => e.getBoundingClientRect()); return es.length === 11 && r.every((b, i) => b.height >= TOUCH && b.left >= -0.5 && b.right <= innerWidth + 0.5 && es[i].scrollWidth <= es[i].clientWidth + 1) && r.every(b => b.bottom <= innerHeight) && document.documentElement.scrollWidth <= innerWidth }, TOUCH)
  await p.getByTestId('back').tap(); await settle(p)
  return head && page
}
for (const [w, h, lang] of [[360, 740, 'es'], [360, 740, 'en'], [390, 844, 'es'], [390, 844, 'en']]) todo.push(async () => {
  const { ctx, p } = await open({ width: w, height: h }, true, {}, lang)
  ok(await chipsFit(p), `${w}px ${lang}: header button is touch sized; the Services page shows all 11, touch sized, on screen, labels not clipped`)
  await ctx.close()
})
const reload = async p => { await p.reload(); await ready(p) }
for (const lang of ['en', 'es']) todo.push(async () => { // at peek the whole nearest-place card is on screen, for every service, in both languages (Spanish is longer)
  const { ctx, p } = await open({ width: 360, height: 740 }, true, {}, lang)
  for (const id of LAYER_IDS) {
    await p.evaluate(i => localStorage.setItem('zgz:v2:layer', i), id); await p.reload(); await p.waitForSelector('[data-testid=nearest],[data-testid=duty-loading],[data-testid=duty-failed]'); await settle(p)
    const gap = await p.evaluate(() => { const n = document.querySelector('[data-testid=nearest],[data-testid=duty-loading],[data-testid=duty-failed]'); return n ? Math.round(n.getBoundingClientRect().bottom - innerHeight) : 'none' })
    ok(gap !== 'none' && gap <= 0, `peek shows the whole nearest card on ${id} (${lang}, ${gap} px past the screen)`)
  }
  await ctx.close()
})
todo.push(async () => { // every service is one tap away, from any other service
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  for (const id of LAYER_IDS) {
    await go(p, id, 'tap'); await settle(p)
    ok(await layerOn(p) === id, `${id}: selected from the Services page`)
  }
  await ctx.close()
})
todo.push(async () => { // the service on show survives a reload
  const { ctx, p } = await open({ width: 390, height: 844 }, true)
  await go(p, 'charge', 'tap'); await settle(p)
  await reload(p)
  ok(await layerOn(p) === 'charge' && await p.getByTestId('nearest').innerText().then(t => /Cargar|Charge/i.test(t)), 'the last service survives a reload')
  await ctx.close()
})
// (removed: the Services button no longer shows the person's most tapped services, only a fixed label; the tap-count ranking is covered by src/lib/usage.test.ts)
todo.push(async () => { // events: a real switch sends tab (with the layer id); the same tab again sends nothing
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'en', { geo: 'blocked' })
  await go(p, 'wifi', 'tap'); await settle(p); await go(p, 'wifi', 'tap'); await settle(p)
  const ev = await p.evaluate(() => window.__ev)
  ok(ev.filter(e => e === 'tab-wifi').length === 1 && !ev.some(e => e.startsWith('goal')), 'events: one tab-wifi, no goal event ' + JSON.stringify(ev))
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
  await go(p, 'bus', 'tap'); await p.waitForFunction(() => document.querySelectorAll('.mk').length > 10); await settle(p) // the stops load in their own chunk (the tab asks for them at once); the map draws only the stops in view (markercluster), around 30 at street zoom
  ok(await markers(p) > 10, `Bus: stops are drawn (${await markers(p)} in view)`)
  // the times show inside the app (city stops); there is no link out to the bus company and no Walk button
  await p.getByTestId('live-times').waitFor({ timeout: 5000 })
  ok(await p.getByTestId('nearest').locator('a[href*="poste="]').count() === 0 && await p.getByTestId('walk').count() === 0, 'Bus card: the times are in the app, no link out and no Walk button')
  await ctx.close()
})
// tram: the stop card lists both directions with no link out to the tram company (the times stay in the app), and the track is drawn
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'tram' })
  await p.waitForSelector('[data-testid=tram-dirs]', { state: 'attached' }); await settle(p)
  ok(await p.getByTestId('tram-info').count() === 0 && await p.getByTestId('tram-times').count() === 0 && await p.locator('[data-testid=nearest] a[href*="tranviasdezaragoza"]').count() === 0, 'tram card: no explanation line and no link out to the tram company')
  ok(/No hay tiempos en vivo/.test(await p.getByTestId('live-times').innerText()) && await p.getByTestId('tram-dirs').getByTestId('dir-chip').count() === 2, 'tram card: the city does not answer, so it says there are no live times and still shows the two directions')
  // the map draws only what is in view and merges close stops into numbered circles: zoom out to the whole line, then single stops plus circle counts add up to every stop
  await p.locator('.leaflet-container').focus() // no zoom buttons on a phone: the map's own keys zoom
  for (let i = 0; i < 4; i++) { await p.keyboard.press('-'); await settle(p) }
  const count = () => document.querySelectorAll('.mk').length + [...document.querySelectorAll('.mkc')].reduce((n, e) => n + (+e.textContent || 0), 0)
  await p.waitForFunction(`(${count})() === ${DATA_TRAM_STOPS}`, null, { timeout: 5000 }).catch(() => {}) // the old circles fade out for a moment while the map zooms; the check below reports a wrong total
  const drawn = await p.evaluate(count)
  ok(drawn === DATA_TRAM_STOPS, `tram: all ${DATA_TRAM_STOPS} stops are drawn, as stops or in circles (${drawn})`)
  ok(await p.evaluate(() => document.querySelector('[data-testid=map]').classList.contains('rail')), 'tram: rail markers shrink when zoomed out (rail class on the map)')
  ok(await p.getByTestId('nearest').innerText().then(x => !/en vivo/i.test(x) || /\d+ min|Ahora/.test(x)), 'tram card claims live only when it shows minutes')
  await p.screenshot({ path: out + '/tram-es.png' })
  await ctx.close()
})
// Cercanias: the next 2 planned trains of each direction, labelled as not real time, with the date of the data; no link out to Renfe (clock fixed on a Wednesday 08:00 so trains are running)
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'cercanias' })
  await ctx.clock.setFixedTime(new Date('2026-11-04T08:00:00+01:00'))
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=train-dirs]'); await settle(p)
  const rows = await p.getByTestId('train-dirs').getByTestId('dir-chip').allInnerTexts()
  const flat = rows.map(r => r.replace(/\n/g, ' '))
  ok(rows.length === 2 && rows.every(r => { const n = (r.match(/\d\d:\d\d/g) || []).length; return n >= 1 && n <= 2 }), `cercanias: each direction shows its next 1 or 2 train times (${flat.join(' | ')})`)
  const note = await p.getByTestId('train-planned').innerText()
  ok(/Horario programado \(no es tiempo real\)/.test(note) && /\d\d\/\d\d\/\d{4}/.test(note), `cercanias: planned label and data date (${note})`)
  ok(await p.getByTestId('train-times').count() === 0 && await p.locator('[data-testid=nearest] a[href*="renfe"]').count() === 0, 'cercanias: no link out to Renfe (the times stay in the app)')
  await p.screenshot({ path: out + '/cercanias-es.png' })
  await ctx.close()
})
// direction picker on the tram card (live API scripted: platform ...1 goes north, ...2 goes south): two rows, each with the times of its own way (the chosen one is filled and decides which tram the map shows), the choice is remembered
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'tram' })
  mock.city = u => { const id = /(\d+)\.json/.exec(u)?.[1] || ''; return id.endsWith('1') ? { destinos: [{ linea: 'T1', destino: 'AVENIDA ACADEMIA', minutos: '9 minutos.' }, { linea: 'T1', destino: 'AVENIDA ACADEMIA', minutos: '20 minutos.' }] } : { destinos: [{ linea: 'T1', destino: 'MAGO DE OZ', minutos: '4 minutos.' }] } }
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=tram-dirs]'); await settle(p)
  const chips = p.getByTestId('tram-dirs').getByTestId('dir-chip')
  ok(await chips.count() === 2, 'tram: two direction chips')
  const labels = await chips.allInnerTexts()
  ok(/Parque Goya/.test(labels[0]) && /Valdespartera/.test(labels[1]) && !labels.some(l => /Hacia/.test(l)), `tram rows name the ends, just the destination (${labels.join(' | ').replace(/\n/g, ' ')})`)
  for (const i of [0, 1]) { const r = await chips.nth(i).boundingBox(); ok(r.height >= TOUCH, `tram chip ${i} is at least ${TOUCH} px (${r.height})`) }
  ok(await chips.nth(1).getAttribute('aria-pressed') === 'true', 'tram: the soonest tram (south, 4 min) is chosen first')
  ok(/9 min · 20 min/.test(labels[0]) && /\b4 min\b/.test(labels[1]) && await p.getByTestId('live-row').count() === 0, `tram: each direction row lists its own next times (${labels.join(' | ').replace(/\n/g, ' ')})`)
  await p.screenshot({ path: out + '/tram-dirs-es.png' })
  await chips.nth(0).tap(); await settle(p)
  ok(await chips.nth(0).getAttribute('aria-pressed') === 'true' && await chips.nth(1).getAttribute('aria-pressed') === 'false', 'tram: one tap switches to north')
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=tram-dirs]'); await settle(p)
  ok(await p.getByTestId('tram-dirs').getByTestId('dir-chip').nth(0).getAttribute('aria-pressed') === 'true', 'tram: the last choice is remembered after a reload, even if the other way is sooner')
  await ctx.close()
})
// direction picker on the Cercanias card: the two travel directions as rows named by their end, each with its own next trains; a way with no train left today is grey (clock fixed on a Wednesday 08:00)
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'cercanias' })
  await ctx.clock.setFixedTime(new Date('2026-11-04T08:00:00+01:00'))
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=train-dirs]'); await settle(p)
  const chips = p.getByTestId('train-dirs').getByTestId('dir-chip')
  ok(await chips.count() === 2, 'cercanias: two direction rows')
  const labels = await chips.allInnerTexts()
  ok(labels.every(l => /^\S/.test(l) && !/^Hacia /.test(l)), `cercanias rows are named by the end station only (${labels.join(' | ').replace(/\n/g, ' ')})`)
  for (const i of [0, 1]) { const r = await chips.nth(i).boundingBox(); ok(r.height >= TOUCH, `cercanias row ${i} is at least ${TOUCH} px (${r.height})`) }
  const chosen = () => chips.evaluateAll(cs => cs.findIndex(c => c.getAttribute('aria-pressed') === 'true'))
  const a = await chosen()
  ok(a >= 0 && /\d\d:\d\d/.test(labels[a]), `cercanias: the chosen way is marked and lists its trains (${labels[a]?.replace(/\n/g, ' ')})`)
  ok(/Horario programado \(no es tiempo real\)/.test(await p.getByTestId('train-planned').innerText()), 'cercanias: still labelled as planned, not real time')
  await p.screenshot({ path: out + '/cercanias-dirs-es.png' })
  const other = 1 - a
  if (!(await chips.nth(other).getAttribute('data-empty') !== null)) {
    await chips.nth(other).tap(); await settle(p)
    ok(await chosen() === other && /\d\d:\d\d/.test(labels[other]), 'cercanias: one tap chooses the other way')
  } else ok(/Sin más trenes hoy/.test(labels[other]), 'cercanias: the empty way says "Sin más trenes hoy"')
  await ctx.close()
})
// approximate vehicle markers: tram (city API scripted), Cercanias (planned times, clock fixed on a Wednesday 08:00); small, faded, never in place of a stop; gone on tab change
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'tram' })
  mock.city = u => { const id = /(\d+)\.json/.exec(u)?.[1] || ''; return id.endsWith('1') ? { destinos: [{ linea: 'T1', destino: 'AVENIDA ACADEMIA', minutos: '9 minutos.' }, { linea: 'T1', destino: 'AVENIDA ACADEMIA', minutos: '20 minutos.' }] } : { destinos: [{ linea: 'T1', destino: 'MAGO DE OZ', minutos: '0 minutos.' }, { linea: 'T1', destino: 'MAGO DE OZ', minutos: '6 minutos.' }, { linea: 'T1', destino: 'MAGO DE OZ', minutos: '12 minutos.' }] } }
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=tram-dirs]'); await settle(p)
  const veh = () => p.locator('.veh').count()
  const south = await p.getByTestId('tram-dirs').getByTestId('dir-chip').nth(1).getAttribute('aria-pressed') === 'true'
  ok(south && await veh() === 1, `tram: 0 min is the stop itself, so one estimated marker for the 6 min tram (${await veh()})`)
  ok(/Posición aproximada/.test(await p.getByTestId('veh-note').innerText()), 'tram: the card says the position is approximate')
  const box = await p.locator('.veh').first().boundingBox(), stop = await p.locator('.mk').first().boundingBox()
  ok(box.width <= 26 && box.width < stop.width && /aprox\./.test(await p.locator('.veh').first().innerText()), `tram: marker is small (${box.width}px, the stop is ${stop.width}px) and badged "aprox."`)
  ok(await markers(p) > 0, 'tram: the stop markers are still there')
  ok(await p.locator('.veh').first().evaluate(e => getComputedStyle(e).pointerEvents === 'none' && getComputedStyle(e).borderStyle === 'dashed'), 'tram: marker has a dashed outline (an estimate) and is not tappable')
  await p.screenshot({ path: out + '/tram-veh-es.png' })
  await p.getByTestId('tram-dirs').getByTestId('dir-chip').nth(0).tap(); await settle(p)
  ok(await veh() === 2, `tram: the north way has two markers (${await veh()})`)
  mock.city = () => null
  await p.waitForTimeout(100)
  await go(p, 'wifi', 'tap'); await settle(p)
  ok(await veh() === 0, 'tram: markers are gone on another tab')
  await ctx.close()
})
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'tram' })
  mock.city = () => null // the city does not answer
  await p.reload(); await ready(p); await settle(p)
  ok(await p.locator('.veh').count() === 1 && /Salida/.test(await p.locator('.veh').first().innerText()), 'tram: no live data, one marker labelled "Salida" shows where the direction starts')
  await ctx.close()
})
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'cercanias' })
  await ctx.clock.setFixedTime(new Date('2026-11-04T08:00:00+01:00'))
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=train-dirs]'); await settle(p)
  const n = await p.locator('.veh').count()
  ok(n >= 1 && n <= 2, `cercanias: ${n} estimated train markers`)
  ok(/Posición aproximada/.test(await p.getByTestId('veh-note').innerText()) && /Horario programado \(no es tiempo real\)/.test(await p.getByTestId('train-planned').innerText()), 'cercanias: approximate note and the planned label')
  ok(await p.locator('.veh').first().evaluate(e => e.style.getPropertyValue('--c').includes('train')), 'cercanias: green mode colour')
  await p.screenshot({ path: out + '/cercanias-veh-es.png' })
  const chips = p.getByTestId('train-dirs').getByTestId('dir-chip')
  const before = await p.locator('.veh').first().boundingBox()
  const other = await chips.evaluateAll(cs => cs.findIndex(c => c.getAttribute('aria-pressed') !== 'true'))
  await chips.nth(other).tap(); await settle(p); await p.waitForTimeout(1800)
  const after = await p.locator('.veh').first().boundingBox()
  ok(Math.abs(before.x - after.x) + Math.abs(before.y - after.y) > 5, 'cercanias: the other way puts the marker on the other side of the station')
  await go(p, 'wifi', 'tap'); await settle(p)
  ok(await p.locator('.veh').count() === 0, 'cercanias: markers are gone on another tab')
  await ctx.close()
})
// live times ask the city once per stop: with location already allowed, the card waits for the position (no request for the centre stop that is replaced), then 1 request per stop; a refresh adds exactly 1 more
todo.push(async () => {
  for (const layer of ['bus', 'tram']) {
    const { ctx, p, mock } = await open({ width: 375, height: 721 }, true, { geolocation: { latitude: 41.6488, longitude: -0.8891 }, permissions: ['geolocation'] }, 'es', { layer, clock: true })
    const hits = {}
    mock.city = u => { hits[u] = (hits[u] || 0) + 1; return { destinos: [{ linea: 'T1', destino: 'CENTRO', primero: '3 minutos.', segundo: '9 minutos.', minutos: '3 minutos.' }] } }
    await p.reload(); await ready(p); await p.waitForSelector('[data-testid=live-row]'); await settle(p)
    const urls = Object.keys(hits)
    ok(urls.length === (layer === 'bus' ? 1 : 2) && urls.every(u => hits[u] === 1), `${layer}: live times ask each stop once at mount (${urls.map(u => u.split('/').pop() + 'x' + hits[u]).join(', ')})`)
    await p.clock.runFor(30_500)
    for (let i = 0; i < 100 && !urls.every(u => hits[u] === 2); i++) await p.waitForTimeout(50)
    await p.waitForTimeout(300) // room for a wrongly doubled request to show
    ok(urls.every(u => hits[u] === 2) && Object.keys(hits).length === urls.length, `${layer}: one refresh adds exactly one request per stop (${urls.map(u => u.split('/').pop() + 'x' + hits[u]).join(', ')})`)
    await ctx.close()
  }
})
// the bus route view: live times of THIS line at this stop
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'bus' })
  mock.city = busAnswer
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=live-row-open]'); await settle(p)
  const chip = p.getByTestId('live-row-open').first(), line = await chip.getAttribute('data-line')
  await chip.tap(); await p.waitForSelector('[data-testid=line-block] [data-testid=live-times] [data-testid=live-row]'); await settle(p)
  const rows = await p.getByTestId('line-block').getByTestId('live-row').allInnerTexts()
  ok(rows.length === 1 && rows[0].includes(line) && /3 min/.test(rows[0]) && !/OTRA/.test(rows[0]), `route view: live minutes of this line only (${rows.join(' | ').replace(/\n/g, ' ')})`)
  ok(/Esta parada/i.test(await p.getByTestId('live-times').innerText()), 'route view: the live box is titled "Esta parada"')
  ok(await p.getByTestId('next-buses').count() === 0, 'route view: no link out to the bus company (the times stay in the app)')
  await p.screenshot({ path: out + '/bus-line-live-es.png' })
  await ctx.close()
})
// a bus line: tap a line row on the stop card, the route replaces the markers, the sheet shows the stepper; back returns
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true, {}, 'es', { geo: 'blocked', layer: 'bus' })
  mock.city = busAnswer
  await p.reload(); await ready(p); await p.waitForSelector('[data-testid=live-row-open]'); await settle(p)
  { const r = await p.getByTestId('live-row-open').first().boundingBox(); ok(r.height >= TOUCH_ROW, `bus line row is at least ${TOUCH_ROW} px (${r.width}x${r.height})`) }
  const chip = p.getByTestId('live-row-open').first(), line = await chip.getAttribute('data-line')
  await chip.tap(); await settle(p)
  ok(await p.getByTestId('line-block').count() === 1 && await p.getByTestId('nearest').count() === 0, 'tapping a line shows the line sheet in place of the stop card')
  const title = await p.getByTestId('line-title').innerText()
  ok(new RegExp(`^Línea ${line}( · hacia .+)?$`).test(title), `title says the line and where it goes (${title})`)
  ok(await p.evaluate(() => window.__ev.includes('bus-line-' + document.querySelector('[data-testid=line-title]').textContent.split(' ')[1])), 'event bus-line-<line> sent: ' + await p.evaluate(() => window.__ev.join(',')))
  ok(await markers(p) === 0, 'line mode: the stop markers are replaced by the route')
  ok(await p.getByTestId('line-steps').locator('li').count() >= 2 && await p.getByTestId('line-steps').locator('li[data-here]').count() === 1, 'the stepper lists the stops in order, this stop first')
  // the route is drawn on the canvas; the map frames this stop and the line's bus mark next to it (not the whole route, which can run far off screen), above the sheet
  await p.waitForFunction(() => { const b = document.querySelector('.leaflet-veh-pane .vbus')?.getBoundingClientRect(); return !!b && b.top >= 0 }, null, { timeout: 5000 }).catch(() => {}) // the map flies to the stop first; the assertion below reports it if the mark never arrives
  const px = await p.evaluate(() => {
    const c = document.querySelector('.leaflet-overlay-pane canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data
    let drawn = 0
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) drawn++
    const bus = document.querySelector('.leaflet-veh-pane .vbus')?.getBoundingClientRect()
    return { drawn, bus: bus && { top: bus.top, bottom: bus.bottom, left: bus.left, right: bus.right }, sheet: document.querySelector('[data-slot=drawer-popup]').getBoundingClientRect().top }
  })
  ok(px.drawn > 0, `the route is drawn on the map (${px.drawn} sampled pixels)`)
  ok(!!px.bus && px.bus.top >= 0 && px.bus.bottom < px.sheet && px.bus.left >= 0 && px.bus.right <= 390, `the line's bus mark is on screen above the sheet (${px.bus ? Math.round(px.bus.top) + '..' + Math.round(px.bus.bottom) : 'none'}, sheet top ${Math.round(px.sheet)})`)
  await p.screenshot({ path: out + '/bus-line-es.png' })
  await p.getByTestId('line-back').tap(); await settle(p)
  ok(await p.getByTestId('line-block').count() === 0 && await p.getByTestId('nearest').count() === 1 && await markers(p) > 10, 'back returns to the nearest stop and its markers')
  await ctx.close()
})
const farm = (date, hours = '09:00-22:00') => ({ result: [{ id: 'x1', title: 'Farmacia Test', geometry: { type: 'Point', coordinates: [-0.8773, 41.6488] }, calle: 'Calle Test 1', telefonos: '976000000', guardia: { fecha: date, horario: hours, sector: 'Centro' } }] })
todo.push(async () => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { serviceWorkers: 'block' })
  await p.route('**/farmacia.json*', r => r.fulfill({ status: 500, body: 'no' }))
  await go(p, 'pharmacy', 'tap'); await settle(p)
  ok(await p.getByTestId('duty-failed').count() === 1 && await p.getByTestId('duty-retry').count() === 1, 'Pharmacy: failed load shows the message and Try again')
  ok((await p.getByTestId('duty-city').getAttribute('href') || '').includes('zaragoza.es/sede/servicio/farmacia'), 'Pharmacy: failure links to the city page')
  ok(await p.getByTestId('nearest-name').count() === 0, 'Pharmacy: no old list shown on failure')
  await p.unroute('**/farmacia.json*')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  await p.route('**/farmacia.json*', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(farm(today)) }))
  await p.getByTestId('duty-retry').tap(); await settle(p)
  ok(await p.getByTestId('duty-failed').count() === 0 && await p.getByTestId('nearest-name').count() === 1 && /Farmacia Test/.test(await p.locator('body').innerText()), 'Pharmacy: Try again loads today\'s duty pharmacy and shows its card')
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
  // the header shows Toilets (first visit); the Services page lists all 11 in three groups, in Spanish
  ok(await p.locator('[data-testid^=goal-]').count() === 0 && await layerOn(p) !== 'water' && /^aseos/i.test(await p.getByTestId('nearest').innerText()), 'header: Toilets on show on a first visit (the card names the service)')
  ok(await chipsFit(p), 'header button and Services page fit')
  await p.getByTestId('services-open').tap(); await p.getByTestId('tab-bus').waitFor(); await settle(p)
  ok(JSON.stringify(await p.locator('[role=heading][aria-level="2"]').allTextContents()) === JSON.stringify(['Básicos', 'Transporte', 'Conectar']) && await p.getByTestId('tab-toilets').getAttribute('aria-pressed') === 'true', 'Services page: three groups, Toilets marked')
  await p.getByTestId('back').tap(); await settle(p)
  await p.screenshot({ path: out + '/t-start.png' })
  const cdp = await ctx.newCDPSession(p)
  const top0 = await snapTop(p)
  const ty = await p.getByTestId('services').evaluate(e => Math.round(e.getBoundingClientRect().top + 25))
  // vertical drag that starts on the tab row still moves the sheet
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: ty }] })
  for (let i = 1; i <= 19; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: ty - 28 * i }] }); await p.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(p)
  ok(await snapTop(p) < top0 - 100, 'vertical drag starting on the tab row moves the sheet')
  // selecting a service: one tap on its chip
  await go(p, 'bizi', 'tap'); await settle(p)
  ok(await layerOn(p) === 'bizi' && await p.locator('.mk').count() > 0, 'Bizi: one tap on its chip draws its markers')
  await go(p, 'libraries', 'tap'); await settle(p)
  ok(await layerOn(p) === 'libraries', 'Libraries is a normal tab with its nearest card')
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
  await go(p, 'toilets', 'tap'); await settle(p) // Bizi stations have no details page
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
  await still(p); const t0 = await snapTop(p)
  await p.mouse.move(300, t0 + 12); await p.mouse.down(); for (let i = 1; i <= 20; i++) { await p.mouse.move(300, t0 + 12 + 10 * i); await p.waitForTimeout(16) } await p.mouse.up(); await settle(p); await still(p)
  ok(await snapTop(p) > t0 + 60 && await p.getByTestId('scroll').evaluate(e => !!e.closest('[inert]')), `600x800 mouse drag down from the handle closes the sheet (${t0} -> ${await snapTop(p)})`)
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
  ok(t.transform && t.transform.startsWith('0.3s') && t.transform.includes('cubic-bezier(0.22, 1, 0.36, 1)'), 'drawer transform 300ms cubic-bezier(.22,1,.36,1)')
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
  ok(Math.abs(m.transformMs - 300) < 60, `measured transform ${m.transformMs}ms ~ 300ms`)
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
  // the round buttons and the zoom control sit in their own strip: no pin under them, and a mouse click reaches them
  for (const vp of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }]) {
    await p.setViewportSize(vp); await settle(p)
    const hit = await p.evaluate(() => {
      const boxes = ['open-settings', 'open-support', 'map-rail'].map(id => document.querySelector(`[data-testid=${id}]`).getBoundingClientRect()).concat([...document.querySelectorAll('.leaflet-control-zoom a')].map(a => a.getBoundingClientRect()))
      return [...document.querySelectorAll('.mk')].filter(m => { const r = m.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; return boxes.some(q => x > q.left && x < q.right && y > q.top && y < q.bottom) }).length
    })
    ok(hit === 0, `desktop ${vp.width}x${vp.height}: no pin centre under the map buttons (${hit})`)
    const gb = await p.getByTestId('open-settings').boundingBox()
    await p.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2); await settle(p)
    ok(await p.getByTestId('settings-view').count() > 0, `desktop ${vp.width}x${vp.height}: a mouse click on the Settings button opens Settings`)
    await p.keyboard.press('Escape'); await settle(p)
  }
  await p.setViewportSize({ width: 1280, height: 800 }); await settle(p)
  // the Nearest list fills the home page: 6 rows, a click selects that place like its pin
  ok(await p.getByTestId('near-row').count() === 6, 'desktop: Nearest list has 6 rows')
  const row2 = (await p.getByTestId('near-row').nth(1).innerText()).split('\n')[0]
  await p.getByTestId('near-row').nth(1).click(); await settle(p)
  ok(await p.getByTestId('nearest-name').innerText() === row2, 'desktop: clicking Nearest row 2 selects that place')
  ok(await p.getByTestId('near-row').nth(1).getAttribute('aria-current') === 'true', 'desktop: the selected row is marked')
  for (const id of ['toilets', 'charge', 'wifi', 'water']) { await go(p, id); await settle(p); ok(await markers(p) > 0, `desktop ${id} renders`) }
  await go(p, 'libraries', 'click'); await settle(p)
  await p.screenshot({ path: out + '/d-libs.png' })
  await ctx.close()
})
// desktop keyboard and mouse: Tab starts in the panel, Escape goes up one page and returns focus, hover shows
todo.push(async () => {
  const { ctx, p } = await open({ width: 1280, height: 800 }, false)
  await p.keyboard.press('Tab')
  ok(await p.evaluate(() => !!document.activeElement.closest('[data-testid=panel]')), 'desktop: the first Tab stop is inside the panel, not on the map')
  const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
  ok(ring !== 'none', 'desktop: the focused control shows a focus ring')
  await p.getByTestId('services-open').focus(); await p.keyboard.press('Enter'); await settle(p)
  ok(await p.getByTestId('services-open').count() === 0, 'desktop: Enter opens the Services page')
  await p.keyboard.press('Escape'); await settle(p)
  ok(await p.getByTestId('services-open').count() === 1, 'desktop: Escape goes back to home')
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'services-open', 'desktop: focus returns to the button that opened the page')
  // hover: a mouse over the button changes its background
  const bg = () => p.getByTestId('services-open').evaluate(e => getComputedStyle(e).backgroundColor)
  const rest = await bg(); await p.getByTestId('services-open').hover(); await p.waitForTimeout(250)
  ok(await bg() !== rest, 'desktop: hover changes the Services button background')
  await ctx.close()
})
// ---- Bizi live counts (CityBikes mocked) ----
const listText = p => p.getByTestId('peek-block').innerText()
// the Take / Return / My bike chips live on the Filters page (the sliders button), not in a bar under the card
const biziPick = async (p, cat) => { await p.getByTestId('filters-open').tap(); await settle(p); await p.getByTestId('filter-' + cat).tap(); await settle(p); await p.getByTestId('back').last().tap(); await settle(p) }
const biziChips = async p => { await p.getByTestId('filters-open').tap(); await settle(p); const r = await p.getByTestId('filters').locator('[data-testid^=filter-]').evaluateAll(es => es.map(e => [e.dataset.testid, e.innerText.trim(), e.getAttribute('aria-pressed')])); await p.getByTestId('back').last().tap(); await settle(p); return r }
const biziTab = async p => { await go(p, 'bizi', 'tap'); await settle(p); await p.waitForSelector('[data-testid=bizi-status][data-state=live]') ; await settle(p) }
todo.push(async () => {
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  ok(mock.hits === 0, 'CityBikes is not called before the Bizi tab opens')
  await biziTab(p)
  ok(mock.hits >= 1, 'CityBikes is called when the Bizi tab opens')
  ok(/Live counts, updated \d\d:\d\d/.test(await p.getByTestId('bizi-status').innerText()), 'Bizi: status says the counts are live, with the time')
  const card = await p.getByTestId('bizi-counts').innerText()
  ok(/^\d+ bikes? \(\d+ electric\) · \d+ free docks?$|^\d+ bikes? · \d+ free docks?$/.test(card), `Bizi card shows bikes, e-bikes and free docks (${card})`)
  const chips = await biziChips(p)
  ok(JSON.stringify(chips.map(c => c[1])) === JSON.stringify(['Take a bike', 'Return a bike', 'My bike']), 'Bizi: three chips on the Filters page ' + chips.map(c => c[1]).join(' | '))
  ok(chips[0][2] === 'true' && chips[1][2] === 'false', 'Take a bike is the default chip')
  const take = await listText(p)
  ok(/\d+ bikes?/.test(take) && !/\b0 bikes\b/.test(take), 'Take: the nearest card shows bikes, never a station with 0 bikes')
  await biziPick(p, 'return')
  const ret = await listText(p)
  ok(/free docks?/.test(ret) && !/\b0 free docks\b/.test(ret), 'Return: the nearest card shows free docks, never 0')
  await biziPick(p, 'mine')
  ok(await markers(p) > 0 && !/ free docks?/.test(await listText(p)) && await p.getByTestId('bizi-status').count() === 0, 'My bike: the racks, no counts, no live status')
  await p.screenshot({ path: out + '/bizi-mine-en.png' })
  // counts change without animation
  await biziPick(p, 'take')
  ok(await p.evaluate(() => document.getAnimations().filter(a => a.animationName !== 'selpulse').length) === 0, 'no animation running after a chip change (the one-shot marker pulse aside)')
  await ctx.close()
})
todo.push(async () => { // the same tab in Spanish, with a screenshot
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'es')
  await biziTab(p)
  ok(/Cifras en directo, actualizadas a las \d\d:\d\d/.test(await p.getByTestId('bizi-status').innerText()), 'ES: live status line')
  ok(/bicis?( \(.*\))? · \d+ anclajes? libres?/.test(await p.getByTestId('bizi-counts').innerText()), 'ES: card counts')
  ok(JSON.stringify((await biziChips(p)).map(c => c[1])) === JSON.stringify(['Coger una bici', 'Dejar una bici', 'Mi bici']), 'ES chips')
  await p.screenshot({ path: out + '/bizi-es.png' })
  await ctx.close()
})
todo.push(async () => { // nothing in the list is wiped when the feed is down
  const { ctx, p, mock } = await open({ width: 390, height: 844 }, true)
  mock.mode = 'fail'
  await go(p, 'bizi', 'tap'); await settle(p)
  await p.waitForSelector('[data-testid=bizi-status][data-state=failed]')
  ok(/Live counts unavailable/.test(await p.getByTestId('bizi-status').innerText()) && await p.getByTestId('bizi-retry').count() === 1, 'failed feed: "Live counts unavailable" and Try again')
  ok(await markers(p) > 0, 'failed feed: the places still show')
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
  ok(await p.getByTestId('all-out').count() === 1, 'no bikes anywhere: the message')
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
const hintAfterPick = async ua => {
  const { ctx, p } = await open({ width: 390, height: 844 }, true, { userAgent: ua })
  await p.evaluate(() => localStorage.setItem('zgz:visits', '2')) // the hint waits for a second visit
  await p.locator('.mk').first().click({ force: true }); await p.waitForTimeout(4500)
  const body = await p.locator('body').innerText()
  const shown = /Install it from your browser menu/.test(body) ? 'menu' : /Open this page in your browser/.test(body) ? 'browser' : /Add to Home Screen/.test(body) ? 'ios' : 'none'
  await ctx.close(); return shown
}
// a normal tab gets the way to install it; an in-app browser (cannot install) is told to open the page in a real browser
todo.push(async () => {
  ok(await hintAfterPick('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36') === 'menu', 'install hint (browser menu) shows in a normal Android Chrome tab')
  ok(await hintAfterPick('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Reddit/Version 2024.20.0') === 'browser', 'Reddit in-app browser: told to open the page in the browser, no install steps')
  ok(await hintAfterPick('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0') === 'browser', 'Instagram in-app browser: told to open the page in the browser, no install steps')
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
  ok(await layerOn(p) === 'pharmacy', 'Android: tab switch works by touch')
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Android: no sideways page scroll')
  await p.screenshot({ path: out + '/android.png' })
  await ctx.close()
})
todo.push(async () => { // a change of choice does not rebuild the map: the other markers stay, and greyed-out places stay on the map with their reason and source
  const { ctx, p } = await open({ width: 390, height: 844 }, true, {}, 'en', { layer: 'libraries' })
  await p.clock.setFixedTime(new Date('2026-11-01T11:00:00+01:00')) // a Sunday: some libraries are closed
  await p.reload(); await ready(p)
  const off0 = await p.locator('.mk.off').count()
  ok(off0 > 0, `closed libraries stay on the map, greyed out (${off0})`)
  await p.locator('.mk.off').first().click({ force: true }); await settle(p)
  ok(await p.getByTestId('off-card').count() === 1, 'tapping a greyed-out place shows its card')
  ok((await p.getByTestId('off-reason').textContent()).includes('Closed'), 'the card says why it is greyed out')
  ok((await p.getByTestId('off-source').textContent()).includes('Source'), 'the card names the source')
  await p.getByTestId('handle').click(); await settle(p) // full: the switch is below the card
  const tagged = await p.evaluate(() => { const all = [...document.querySelectorAll('.mk')]; all.forEach(e => { e.dataset.keep = '1' }); return all.length })
  await p.locator('.mk:not(.off)').evaluateAll(es => { const e = es.find(x => { const r = x.getBoundingClientRect(); return r.x > 20 && r.x < innerWidth - 20 && r.y > 60 && r.y < 400 }); e?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await settle(p) // another place gets picked: nothing rebuilds
  const kept = await p.locator('.mk[data-keep="1"]').count()
  ok(kept >= tagged * 0.5, `picking another place does not rebuild the markers (${kept} of ${tagged} map elements survived)`) // a rebuild would leave none; the map only drops the few that leave the view
  ok(await p.locator('.mk.off').count() > 0, 'closed places keep their grey look after the pick')
  await ctx.close()
})
// run the blocks in a pool (half the cores), then the timing-sensitive ones alone
const pool = async (jobs, n) => { const q = [...jobs]; await Promise.all(Array.from({ length: n }, async () => { for (let j; (j = q.shift());) await j().catch(e => { fails++; console.log('FAIL block crashed: ' + String(e.message).split('\n')[0] + ' (' + (/check\.mjs:(\d+)/.exec(e.stack)?.[1] ?? '?') + ')') }) })) }
const t0 = Date.now()
await pool(todo, Math.max(2, Math.floor(os.cpus().length / 2)))
await pool(late, 1)
console.log(`checks took ${((Date.now() - t0) / 1000).toFixed(1)}s`)
await b.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
