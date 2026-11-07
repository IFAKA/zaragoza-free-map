import { track } from '../lib/analytics'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withCounts } from '../lib/bizi'
import { lsGet, lsSet } from '../lib/cache'
import { getFavs, touchFav } from '../lib/favs'
import { loadDuty, madridDate, readDutyCache, todays } from '../lib/duty'
import type { DutyRow } from '../lib/sources.ts'
import { initialLang, DICT, type Lang } from '../lib/i18n'
import { nowMadrid } from '../lib/hours'
import { installEnv, installWay, promptInstall } from '../lib/install'
import { rankOrAll, unavailable } from '../lib/rank'
import { DATA } from '../data'
import { loadBusRoutes, loadCercaniasTimes, type CercaniasTimes } from '../data/lazy'
import { decodePolyline, pickDirection, stopIndex, type BusRoutes } from '../lib/transit'
import { CENTER } from '../lib/geo'
import type { LatLon, LayerId } from '../lib/types'
import { LAYERS, defaultLayer } from '../layers'
import { dutyItems } from '../layers/build'
import { LangCtx } from './lang'
import { LocatingCtx, SheetClosedCtx } from './sheet'
import type { FlyRequest, RouteView } from './MapView'
// Leaflet and its cluster plugin are most of the code; they load as their own chunk so the drawer can paint first
const MapView = lazy(() => import('./MapView').then(m => ({ default: m.MapView })))
import { PageFrame, PagedDrawer, usePages } from './PagedDrawer'
import { FavsPage } from './FavsPage'
import { HomePage, PlacePage, ServicesPage, type LineView } from './Pages'
import { VehicleCtx } from './vehicles'
import type { Vehicle } from '../lib/vehicles'
import { SettingsView, useSettingsView } from './SettingsView'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { serviceOrder } from '../layers/goals'
import { bumpTap, parseTaps, rankByTaps } from '../lib/usage'
import { SettingsFab } from './SettingsFab'
import { ToastHost, toasts } from './ToastHost'
import { useBizi } from './useBizi'
import { useLocation } from './useLocation'

type Page = 'home' | 'place' | 'services' | 'favs'

// Drawer levels. Closed shows only the service header; peek adds the card of the nearest place and the two after it; full adds the controls and the rest of the page.
const CLOSED = 0, PEEK = 1, FULL = 1 // two states: closed (the header only) and open (the height of the content, the whole screen when it needs more)
const DEFAULT_CLOSED_PX = 94, DEFAULT_PEEK_PX = 360
const OPEN_SHARE = 0.04 // the open sheet may use all but this much of the screen
const MAP_SHARE_MIN = 0.72 // the map is framed as if the sheet were at most this tall (a taller sheet covers the rest)
/** The phone's bottom safe area (home indicator) in px. */
function safeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return inset
}
/** Height of the closed sheet: the handle, the service header and the filter row, plus the phone's bottom safe area. Measured, so it follows the real layout. */
function useClosedPx(dep: unknown) {
  const [px, setPx] = useState(DEFAULT_CLOSED_PX)
  useEffect(() => {
    const measure = () => {
      const pop = document.querySelector('[data-slot=drawer-popup]'), head = pop?.querySelector('[data-testid=filters]') ?? pop?.querySelector('[data-testid=services]')
      if (!pop || !head) return
      const next = Math.ceil(head.getBoundingClientRect().bottom - pop.getBoundingClientRect().top + safeBottom())
      if (next > 40) setPx(old => (old === next ? old : next))
    }
    measure()
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', measure) }
  }) // after every render: the filter row comes and goes with the service
  void dep
  return px
}

/**
 * Height of the peeking sheet: from the top of the sheet to the end of the peek block (the service header and the one card), plus the bottom safe area.
 * Measured on the real layout, so a long Spanish bus card or a hint line can never be cut off. Re-measured on every render and whenever any part changes size.
 */
function usePeekPx(block: HTMLElement | null, share: number): number {
  const [px, setPx] = useState(DEFAULT_PEEK_PX)
  const measure = useCallback(() => {
    const pop = block?.closest('[data-slot=drawer-popup]')
    if (!block || !pop) return
    let scrolled = 0 // a block inside a scrolled area still counts from its top, so the height does not follow the scrolling
    for (let e = block.parentElement; e && e !== pop; e = e.parentElement) scrolled += e.scrollTop
    const next = Math.min(Math.ceil(block.getBoundingClientRect().bottom + scrolled - pop.getBoundingClientRect().top + safeBottom()), Math.floor(window.innerHeight * (1 - share)))
    if (next > 120) setPx(old => (old === next ? old : next))
  }, [block, share])
  useEffect(measure) // after every render
  useEffect(() => {
    if (!block?.parentElement) return
    const ro = new ResizeObserver(measure)
    for (const c of Array.from(block.parentElement.children)) ro.observe(c)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [block, measure])
  return px
}

/**
 * Height of the full sheet on the home page: the sheet as tall as its content (top of the sheet to the end of the scrolled content, plus the bottom safe area),
 * and never taller than the screen. A short card then has no empty space under it. Returns 1 (the whole screen) when the content needs it.
 */
function useFullPx(viewport: React.RefObject<HTMLElement | null>, on: boolean): string | number {
  const [px, setPx] = useState<string | number>(1)
  const measure = useCallback(() => {
    const vp = viewport.current, content = vp?.firstElementChild, pop = vp?.closest('[data-slot=drawer-popup]')
    if (!on || !vp || !content || !pop) { setPx(old => (old === 1 ? old : 1)); return }
    const need = Math.ceil(vp.getBoundingClientRect().top - pop.getBoundingClientRect().top + content.getBoundingClientRect().height + safeBottom()) + 16
    const next = need >= window.innerHeight - 24 ? 1 : need + 'px'
    setPx(old => (old === next ? old : next))
  }, [viewport, on])
  const watched = useRef<Element | null>(null)
  const ro = useMemo(() => new ResizeObserver(() => measure()), [measure])
  useEffect(() => { // after every render: the page may mount after the first one, so look again for its content
    measure()
    const content = on ? viewport.current?.firstElementChild ?? null : null
    if (content !== watched.current) { ro.disconnect(); if (content) ro.observe(content); watched.current = content }
  })
  useEffect(() => { window.addEventListener('resize', measure); return () => { window.removeEventListener('resize', measure); ro.disconnect(); watched.current = null } }, [measure, ro])
  return px
}

/** The Bizi stations (not the bike racks): the places that live counts are joined to. */
const BIZI_STATIONS = LAYERS.bizi.items.filter(i => i.cat === 'station')
/** Chip selected when a tab opens: Bizi starts on "Take a bike", the others on "All". */
const catStart = (id: LayerId) => LAYERS[id].catDefault ?? 'all'
const isLayer = (v: string | null): v is LayerId => !!v && v in LAYERS
function useDesktop() {
  const q = '(min-width: 900px)'
  const [d, setD] = useState(() => matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q); const f = () => setD(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return d
}
const saved = <T,>(k: string, def: T, parse: (s: string) => T | undefined): T => { const s = lsGet(k); const v = s == null ? undefined : parse(s); return v === undefined ? def : v }

export function App() {
  const desktop = useDesktop()
  const [lang, setLangState] = useState<Lang>(initialLang)
  const t = DICT[lang]
  const [layerId, setLayerId] = useState<LayerId>(() => saved<LayerId>('layer', defaultLayer(), s => (isLayer(s) ? s : undefined)))
  const [openOnly, setOpenOnlyS] = useState(() => saved('open', true, s => s !== '0'))
  const [showRange, setShowRangeS] = useState(() => saved('range', true, s => s !== '0'))
  const [cat, setCat] = useState(() => catStart(layerId))
  const [selected, setSelected] = useState<string | null>(null)
  const [level, setLevel] = useState(PEEK)
  const [pick, setPick] = useState(0)
  const [fly, setFly] = useState<FlyRequest | null>(null)
  const [peekEl, setPeekEl] = useState<HTMLElement | null>(null)
  const [tick, setTick] = useState(0)
  // a bus line chosen on a stop card: its route replaces the markers until the person goes back
  const [lineSel, setLineSel] = useState<{ line: string; dir: number; anchor: string } | null>(null)
  const [routes, setRoutes] = useState<BusRoutes | null>(null)
  const [times, setTimes] = useState<CercaniasTimes | null>(null)
  const [fitN, setFitN] = useState(0)
  const [vehicles, setVehicles] = useState<Vehicle[]>([]) // estimated tram / Cercanías positions, published by the stop card
  const { pos, locating, denied, locate, alreadyGranted, blocked } = useLocation(a => { if (a !== 'error') track(a === 'granted' ? 'locate-granted' : 'locate-denied') })
  const askedLocation = useRef(false)
  const flyN = useRef(0)
  const viewport = useRef<HTMLDivElement>(null)

  const layer = LAYERS[layerId]
  // Pharmacies on duty: loaded live when that tab is open, and only ever today's list (see lib/duty.ts)
  const today = madridDate()
  const [duty, setDuty] = useState<{ rows: DutyRow[] | null; failed: boolean }>({ rows: null, failed: false })
  const [dutyTry, setDutyTry] = useState(0)
  const onDuty = layerId === 'pharmacy'
  useEffect(() => {
    if (!onDuty) return
    let live = true
    setDuty({ rows: readDutyCache(today), failed: false }) // today's saved list shows at once; the live one replaces it
    loadDuty(today).then(rows => { if (live) setDuty({ rows, failed: !rows }) })
    return () => { live = false }
  }, [onDuty, today, dutyTry])
  const dutyRows = onDuty && duty.rows ? todays(duty.rows, today) : null
  const liveState: 'loading' | 'failed' | null = !layer.live || dutyRows ? null : duty.failed ? 'failed' : 'loading'
  // Bizi: live bike and dock counts while that tab is open (see lib/bizi.ts); the places always show
  const bizi = useBizi(layerId === 'bizi', BIZI_STATIONS)
  const layerItems = useMemo(() => (layer.live ? (dutyRows ? dutyItems(dutyRows) : []) : layerId === 'bizi' ? withCounts(layer.items, bizi.counts) : layer.items), [layer, layerId, dutyRows, bizi.counts])
  useEffect(() => { if (layerId === 'cercanias' && !times) void loadCercaniasTimes().then(setTimes) }, [layerId, times])
  useEffect(() => { if (layerId === 'bus' && !routes) void loadBusRoutes().then(setRoutes) }, [layerId, routes])
  const zoomTitles = useMemo(() => ({ in: t.zoomIn, out: t.zoomOut }), [t])
  const setLang = (l: Lang) => { if (l !== lang) track('lang', l); setLangState(l); lsSet('lang', l); document.documentElement.lang = l }
  const setOpenOnly = (v: boolean) => { setOpenOnlyS(v); lsSet('open', v ? '1' : '0') }
  const setShowRange = (v: boolean) => { setShowRangeS(v); lsSet('range', v ? '1' : '0') }

  useEffect(() => { document.documentElement.lang = lang; document.title = `${t.title} · ${t.subtitle}` }, [lang, t])
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 60_000); return () => clearInterval(i) }, [])

  const { page, go, goUp, reset, turn, pageRef } = usePages<Page>('home')
  const [livePage, setLivePage] = useState<Page>('home') // the page on screen: it follows `page` once the old one has faded out
  const view = useSettingsView()
  // the order of the service chips: decided once, when the app opens, from this person's own tap counts (kept on this device). It never changes while the app is open.
  const [chipOrder] = useState<LayerId[]>(() => rankByTaps(serviceOrder(), parseTaps(lsGet('taps'))))
  const mobileLow = !desktop && level === CLOSED
  const closedPx = useClosedPx(desktop || lang)
  const pagePx = usePeekPx(peekEl, OPEN_SHARE)
  const fullPx = useFullPx(viewport, livePage === 'home' && !desktop)
  // open: the home sheet fits all its content; the other pages fit their block. Either becomes the whole screen when it needs more than the screen.
  const openSnap: string | number = livePage === 'home' ? fullPx : pagePx >= window.innerHeight * (1 - OPEN_SHARE) ? 1 : pagePx + 'px'
  const peekPx = typeof openSnap === 'number' ? Math.round(window.innerHeight * MAP_SHARE_MIN) : Math.min(parseInt(openSnap), Math.round(window.innerHeight * MAP_SHARE_MIN))
  const snapPoints = useMemo<(string | number)[]>(() => [closedPx, openSnap], [closedPx, openSnap])
  const mobileClosed = !desktop && level === CLOSED
  // a closed sheet shows only the chip row, so it always closes onto the first page
  useEffect(() => { if (mobileClosed) reset() }, [mobileClosed, reset])

  const { arr, allClosed, allOut } = useMemo(
    () => rankOrAll(layer, layerItems, { ref: pos, openOnly, cat: layer.cats && cat !== 'all' ? cat : null }, nowMadrid()),
    // tick re-evaluates open/closed as the minutes pass
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, layerItems, pos, openOnly, cat, tick])
  // places the filters leave out because they are not available: still on the map, greyed out
  const offItems = useMemo(() => {
    if (layer.live || lineSel) return []
    const ids = new Set(arr.map(i => i.id))
    return unavailable(layer, layerItems, { ref: pos, openOnly, cat: layer.cats && cat !== 'all' ? cat : null }, nowMadrid()).filter(i => !ids.has(i.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arr, layer, layerItems, pos, openOnly, cat, lineSel])
  const mapItems = useMemo(() => (offItems.length ? [...arr, ...offItems] : arr), [arr, offItems])
  const offSel = selected && !arr.some(i => i.id === selected) ? offItems.find(i => i.id === selected) ?? null : null
  const chosen = selected ? arr.find(i => i.id === selected) ?? null : null
  const focus = chosen ?? arr[0] ?? null

  // the chosen line as the map and the sheet need it (null when none, or while the line file is loading)
  const lineData = useMemo(() => {
    if (!lineSel || !routes || layerId !== 'bus') return null
    const ln = routes.lines[lineSel.line], a = layer.items.find(i => i.id === lineSel.anchor)
    if (!ln || !a) return null
    const dir = Math.min(lineSel.dir, ln.d.length - 1), d = ln.d[dir]
    const idx = stopIndex(d.s, routes.stops, a.stop, [a.lat, a.lon], 150)
    const stops = d.s.map(c => ({ post: String(c), name: routes.stops[c]?.[0] ?? '', lat: routes.stops[c]?.[1] ?? 0, lon: routes.stops[c]?.[2] ?? 0 }))
    const view: LineView = { line: lineSel.line, dir, dirs: ln.d.length, to: d.to, stops, idx, stop: a.stop }
    const route: RouteView = { key: lineSel.line + '|' + dir, paths: d.p.map(decodePolyline), stops, cur: idx }
    return { view, route }
  }, [lineSel, routes, layerId, layer])

  // the rail line of the tram / Cercanías tab, drawn under the stops
  const track_ = useMemo(() => (layerId === 'tram' ? DATA.tram.line : layerId === 'cercanias' ? DATA.cercanias.line : null)?.map(decodePolyline) ?? null, [layerId])

  const insetPx = useCallback(() => {
    if (desktop) return 0
    return level === CLOSED ? closedPx : peekPx
  }, [desktop, level, closedPx, peekPx])

  const lastFly = useRef<FlyRequest | null>(null)
  const flyTo = useCallback((to: LatLon, zoom: number, o: Partial<FlyRequest> = {}) => { const r = { n: ++flyN.current, to, zoom, ...o }; lastFly.current = r; setFly(r) }, [])
  // the card got taller or shorter (another place, another language, another page): slide the map to frame the same place above the new edge of the sheet, as the sheet moves
  useEffect(() => {
    const r = lastFly.current
    if (lineData) setFitN(n => n + 1)
    else if (r && !desktop && level === PEEK && page === 'home') setFly({ ...r, n: ++flyN.current, soft: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekPx])

  // show the nearest place of the current layer whenever the layer or the filters change
  const first = arr[0]?.id
  useEffect(() => {
    const it = arr[0]
    if (skipNearest.current) { skipNearest.current = false; return }
    if (!it || lineSel) return
    flyTo([it.lat, it.lon], 16, pos ? { fitUser: pos } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, first, !!pos])

  // locate silently when the browser already allows it
  const [permPending, setPermPending] = useState(true) // until we know whether the browser already allows location
  useEffect(() => { alreadyGranted().then(ok => { if (ok) locate(); setPermPending(false) }) }, [alreadyGranted, locate])

  const askLocation = () => {
    // the first tap is the first moment of intent (and a user gesture): ask for the position once, unless the person already blocked it
    if (!pos && !askedLocation.current && !blocked()) { askedLocation.current = true; void locate(true) }
  }
  /** A service chip: show that service, count the tap for the chip order (next time the app opens), reset the page. The chip of the service you are on opens a closed sheet, or goes back to the first page. */
  const pickLayer = (id: LayerId) => {
    askLocation()
    if (id === layerId) {
      if (page !== 'home') reset()
      else if (level === CLOSED) setLevel(PEEK)
      return
    }
    track('tab', id)
    lsSet('taps', JSON.stringify(bumpTap(parseTaps(lsGet('taps')), id)))
    setLayerId(id); lsSet('layer', id); setSelected(null); setCat(catStart(id)); setLineSel(null)
    reset()
    if (level === CLOSED) setLevel(PEEK)
    viewport.current?.scrollTo({ top: 0 })
  }
  // a map marker or one of the two places under the card: show its card at peek, with the place and you both framed above the sheet (only the place when your position is unknown)
  // Install hint: only on a second visit or later (the first visit is about the job), once, a few seconds after a place is picked
  const hintDone = useRef(false)
  const installHint = () => {
    if (hintDone.current || lsGet('hinted') || Number(localStorage.getItem('zgz:visits') || 0) < 2) return
    const way = installWay(installEnv())
    if (!way) return
    hintDone.current = true
    lsSet('hinted', '1')
    const title = way === 'prompt' ? t.installHint : way === 'ios' ? t.installIos : way === 'browser' ? t.installBrowser : t.installMenu
    setTimeout(() => toasts.add({ title, timeout: way === 'prompt' ? 9000 : 12000, data: { close: t.installClose, action: way === 'prompt' ? t.installBtn : undefined, onAction: () => void promptInstall() } }), 3000)
  }
  const select = (id: string) => {
    track('select', layerId)
    installHint()
    setSelected(id)
    setPick(n => n + 1)
    const it = arr.find(i => i.id === id) ?? offItems.find(i => i.id === id)
    if (!desktop) setLevel(PEEK)
    if (it) pos ? flyTo([it.lat, it.lon], 17, { fitUser: pos }) : flyTo([it.lat, it.lon], 18)
  }
  // a favourite chip: select that place; one of another service first switches to that service
  const skipNearest = useRef(false)
  const openFav = (lid: string, id: string) => {
    touchFav(lid, id)
    reset() // from the Favourites page: back to Home
    if (lid === layerId) return select(id)
    if (!isLayer(lid)) return
    askLocation()
    const it = LAYERS[lid].items.find(i => i.id === id)
    skipNearest.current = true // the effect below would frame the nearest place of the new service
    setLayerId(lid); lsSet('layer', lid); setCat(catStart(lid)); setLineSel(null)
    reset()
    setSelected(id); setPick(n => n + 1)
    if (!desktop) setLevel(PEEK)
    if (it) pos ? flyTo([it.lat, it.lon], 17, { fitUser: pos }) : flyTo([it.lat, it.lon], 18)
  }
  // a line chip on the stop card: draw that line's route, in the direction this stop is on
  const pickLine = (line: string) => {
    if (!routes || !focus) return
    const ln = routes.lines[line]
    if (!ln) return
    track('bus-line', line)
    setLineSel({ line, dir: pickDirection(ln, routes.stops, focus.stop, [focus.lat, focus.lon]).dir, anchor: focus.id })
    if (!desktop) setLevel(PEEK)
  }
  const lineDir = () => setLineSel(l => (l && routes ? { ...l, dir: (l.dir + 1) % routes.lines[l.line].d.length } : l))
  // back to the nearest-stop mode: the markers return and the map shows the stop again
  const lineBack = () => {
    setLineSel(null)
    if (focus) flyTo([focus.lat, focus.lon], 16, pos ? { fitUser: pos } : {})
  }
  // a stop dot on the line: make it the current stop
  const lineStop = (post: string) => { if (layer.items.some(i => i.id === 'u' + post)) setLineSel(l => (l ? { ...l, anchor: 'u' + post } : l)) }
  // a tap on the bare map lowers the sheet one step: full to peek, peek to closed
  const mapTap = () => {
    setSelected(null)
    if (!desktop) setLevel(l => Math.max(CLOSED, l - 1))
  }
  const doLocate = () => { askedLocation.current = true; void locate(true) }
  const onWalk = () => {
    track('directions', layerId)
  }
  // a page that is not home (details, services) sizes the sheet to its own content (peek height) and gives back the size you had when you leave
  const levelBefore = useRef(PEEK)
  // The sheet changes size once per page turn, when the new page is on screen (not while the old one still fades out): see onShown below.
  const pendingLevel = useRef<number | null>(null)
  const pageNow = useRef(page); pageNow.current = page
  const onShown = useCallback(() => {
    // the sheet grows or shrinks once, smoothly, under the fading-in page (not twice: no tall blank sheet that then shrinks)
    if (pendingLevel.current != null) { setLevel(pendingLevel.current); pendingLevel.current = null }
    setLivePage(pageNow.current)
  }, [])
  const turnTo = (p: Page) => { levelBefore.current = level; go(p); pendingLevel.current = PEEK }
  const back = () => { if (goUp() && page !== 'home') pendingLevel.current = levelBefore.current }
  const openServices = () => turnTo('services')
  const openFavs = () => { turnTo('favs'); if (getFavs().length > 4) pendingLevel.current = FULL }
  // Escape and the back gesture: up one page, then lower the sheet one step
  const escape = () => { if (view.isOpen) return; if (lineSel) return lineBack(); if (goUp()) { if (page !== 'home') pendingLevel.current = levelBefore.current } else setLevel(l => Math.max(CLOSED, l - 1)) }
  const cycle = () => setLevel(l => (l === CLOSED ? PEEK : CLOSED))
  const levelOf = (v: string | number | null) => { const i = v == null ? -1 : snapPoints.indexOf(v); return i < 0 ? null : i }

  const pageEl = (() => {
    switch (page) {
      case 'services': return <ServicesPage layer={layer.id} onPick={pickLayer} onBack={back} peekRef={setPeekEl} />
      case 'favs': return <FavsPage onOpen={openFav} onBack={back} peekRef={setPeekEl} locked={mobileLow} pos={pos} />
      case 'place': return <PlacePage layer={layer} item={focus} hasPos={!!pos} onBack={back} onWalk={onWalk} locked={mobileLow} peekRef={setPeekEl} />
      default: return (
        <HomePage
          off={offSel} layer={layer} liveState={liveState} onRetry={() => setDutyTry(n => n + 1)} arr={arr} allClosed={allClosed} allOut={allOut} denied={denied} bizi={bizi} focus={focus} selected={chosen ? chosen.id : null} hasPos={!!pos} origin={pos ?? CENTER} locating={locating} peekRef={setPeekEl}
          routes={routes} times={times} onLine={pickLine} lineView={lineData?.view ?? null} onLineBack={lineBack} onLineDir={lineDir}
          openOnly={openOnly} setOpenOnly={setOpenOnly} showRange={showRange} setShowRange={setShowRange} cat={cat} setCat={c => { setCat(c); setSelected(null) }}
          locked={mobileLow} viewportRef={viewport}
          onServices={openServices} onShowService={() => setLevel(l => (l === CLOSED ? PEEK : l))} chipOrder={chipOrder} onFavs={openFavs} onLocate={doLocate} onDetails={() => turnTo('place')} onWalk={onWalk}
          desktop={desktop}
        />
      )
    }
  })()

  return (
    <LangCtx.Provider value={lang}>
      <LocatingCtx.Provider value={permPending || locating}>
      <VehicleCtx.Provider value={setVehicles}>
      <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation} strict>
      <ToastHost>
        <div className="fixed inset-0 overflow-hidden bg-surface" data-desktop={desktop ? '' : undefined}>
          <div className={desktop ? 'absolute inset-y-0 right-0 left-[400px]' : 'absolute inset-0'}>
            <Suspense fallback={null}><MapView
              layer={layer} items={lineData ? [] : mapItems} pick={pick} selected={lineData ? null : offSel ? offSel.id : chosen ? chosen.id : focus?.id ?? null} userPos={pos} fly={fly} inset={insetPx}
              showRange={showRange} desktop={desktop} onSelect={select} onBackgroundClick={mapTap} route={lineData?.route ?? null} track={track_} fitN={fitN} vehicles={vehicles} vehBadge={t.vehBadge} vehStart={t.vehStart} onRouteStop={lineStop} label={t.map} zoomTitles={zoomTitles}
            /></Suspense>
          </div>
          {desktop ? (
            <aside aria-label={t.panel} data-testid="panel" className="absolute inset-y-0 left-0 z-10 flex w-[400px] flex-col border-r border-line bg-paper shadow-[2px_0_14px_rgb(0_0_0/0.12)]">
              <PageFrame turn={turn} onShown={onShown} pageRef={pageRef}>{pageEl}</PageFrame>
            </aside>
          ) : (
            <SheetClosedCtx.Provider value={mobileClosed}>
              <PagedDrawer snapPoints={snapPoints} snap={snapPoints[level]} onSnap={v => { const l = levelOf(v); if (l != null) setLevel(l) }} onEscape={escape} onFlickDown={() => setLevel(l => Math.max(CLOSED, l - 1))} turn={turn} onShown={onShown} pageRef={pageRef} handleLabel={t.handle} title={t.title} onHandle={cycle}>
                {pageEl}
              </PagedDrawer>
            </SheetClosedCtx.Provider>
          )}
        </div>
        <SettingsFab label={t.settings} onClick={() => view.open('settings')} inert={view.isOpen} />
        <SettingsView stack={view.stack} push={view.push} back={view.back} close={view.close} lang={lang} setLang={setLang} title={t.settingsTitle} />
      </ToastHost>
      </LazyMotion></MotionConfig>
      </VehicleCtx.Provider>
      </LocatingCtx.Provider>
    </LangCtx.Provider>
  )
}
