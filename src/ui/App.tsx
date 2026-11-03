import { track } from '../lib/analytics'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withCounts } from '../lib/bizi'
import { lsGet, lsSet } from '../lib/cache'
import { loadDuty, madridDate, readDutyCache, todays } from '../lib/duty'
import type { DutyRow } from '../lib/sources.ts'
import { initialLang, DICT, type Lang } from '../lib/i18n'
import { nowMadrid } from '../lib/hours'
import { canShowInstallHint, installEnv } from '../lib/install'
import { rankOrAll } from '../lib/rank'
import { DATA } from '../data'
import { loadBusRoutes, loadCercaniasTimes, type CercaniasTimes } from '../data/lazy'
import { decodePolyline, pickDirection, stopIndex, type BusRoutes } from '../lib/transit'
import { CENTER } from '../lib/geo'
import type { LatLon, LayerId } from '../lib/types'
import { LAYERS, defaultLayer } from '../layers'
import { dutyItems } from '../layers/build'
import { LangCtx } from './lang'
import { LocatingCtx, SheetClosedCtx } from './sheet'
import { MapView, type FlyRequest, type RouteView } from './MapView'
import { PageFrame, PagedDrawer, usePages } from './PagedDrawer'
import { HomePage, PlacePage, type LineView } from './Pages'
import { VehicleCtx } from './vehicles'
import type { Vehicle } from '../lib/vehicles'
import { SettingsView, useSettingsView } from './SettingsView'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { GOAL_IDS, goalById, goalOf, serviceFor, type GoalId } from '../layers/goals'
import { bumpTap, parseLast, parseTaps, rankByTaps } from '../lib/usage'
import { SettingsFab } from './SettingsFab'
import { ToastHost, toasts } from './ToastHost'
import { useBizi } from './useBizi'
import { useLocation } from './useLocation'

type Page = 'home' | 'place'

// Drawer levels. Closed shows only the tab bar; peek adds the card of the nearest place and the two after it; full adds the controls and the rest of the page.
const CLOSED = 0, PEEK = 1, FULL = 2
const DEFAULT_CLOSED_PX = 78, DEFAULT_PEEK_PX = 360
const MAP_SHARE = 0.28 // the sheet never covers more than 72% of the screen at peek: this much stays for the map
/** The phone's bottom safe area (home indicator) in px. */
function safeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return inset
}
/** Height of the closed sheet: the handle and the tab bar, plus the phone's bottom safe area. Measured, so it follows the real layout. */
function useClosedPx(dep: unknown) {
  const [px, setPx] = useState(DEFAULT_CLOSED_PX)
  useEffect(() => {
    const measure = () => {
      const pop = document.querySelector('[data-slot=drawer-popup]'), tabs = pop?.querySelector('[role=tablist]')
      if (!pop || !tabs) return
      const next = Math.ceil(tabs.parentElement!.getBoundingClientRect().bottom - pop.getBoundingClientRect().top + safeBottom())
      if (next > 40) setPx(old => (old === next ? old : next))
    }
    measure()
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', measure) }
  }, [dep])
  return px
}

/**
 * Height of the peeking sheet: from the top of the sheet to the end of the peek block (tabs, chips, the card, the two places after it), plus the bottom safe area.
 * Measured on the real layout, so a long Spanish bus card or a hint line can never be cut off. Re-measured on every render and whenever any part changes size.
 */
function usePeekPx(block: HTMLElement | null): number {
  const [px, setPx] = useState(DEFAULT_PEEK_PX)
  const measure = useCallback(() => {
    const pop = block?.closest('[data-slot=drawer-popup]')
    if (!block || !pop) return
    const next = Math.min(Math.ceil(block.getBoundingClientRect().bottom - pop.getBoundingClientRect().top + safeBottom()), Math.floor(window.innerHeight * (1 - MAP_SHARE)))
    if (next > 120) setPx(old => (old === next ? old : next))
  }, [block])
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
  const view = useSettingsView()
  // the order of the goal tabs: decided once, when the app opens, from this person's own tap counts (kept on this device). It never changes while the app is open.
  const [goalOrder] = useState<GoalId[]>(() => rankByTaps(GOAL_IDS, parseTaps(lsGet('taps'))))
  const mobileLow = !desktop && level !== FULL
  const closedPx = useClosedPx(desktop || lang)
  const peekPx = usePeekPx(peekEl)
  const snapPoints = useMemo<(string | number)[]>(() => [closedPx, peekPx + 'px', 1], [closedPx, peekPx])
  const mobileClosed = !desktop && level === CLOSED
  // a closed sheet shows only the tab bar, so it always closes onto the first page
  useEffect(() => { if (mobileClosed) reset() }, [mobileClosed, reset])

  const { arr, allClosed, allOut } = useMemo(
    () => rankOrAll(layer, layerItems, { ref: pos, openOnly, cat: layer.cats && cat !== 'all' ? cat : null }, nowMadrid()),
    // tick re-evaluates open/closed as the minutes pass
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, layerItems, pos, openOnly, cat, tick])
  const chosen = selected ? arr.find(i => i.id === selected) ?? null : null
  const focus = chosen ?? arr[0] ?? null
  // the two nearest places after the one on the card
  const nearby = useMemo(() => (focus ? arr.filter(i => i.id !== focus.id).slice(0, 2) : []), [arr, focus])

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
  // the card got taller or shorter (another place, another language): frame the same place again above the new edge of the sheet, without animation
  useEffect(() => {
    const r = lastFly.current
    if (lineData) setFitN(n => n + 1)
    else if (r && !desktop && level === PEEK) setFly({ ...r, n: ++flyN.current, instant: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekPx])

  // show the nearest place of the current layer whenever the layer or the filters change
  const first = arr[0]?.id
  useEffect(() => {
    const it = arr[0]
    if (!it || lineSel) return
    flyTo([it.lat, it.lon], 16, pos ? { fitUser: pos } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, first, !!pos])

  // locate silently when the browser already allows it
  const [permPending, setPermPending] = useState(true) // until we know whether the browser already allows location
  useEffect(() => { alreadyGranted().then(ok => { if (ok) locate(); setPermPending(false) }) }, [alreadyGranted, locate])

  const raise = (min: number = FULL) => setLevel(l => Math.max(l, min))
  const askLocation = () => {
    // the first tap is the first moment of intent (and a user gesture): ask for the position once, unless the person already blocked it
    if (!pos && !askedLocation.current && !blocked()) { askedLocation.current = true; void locate(true) }
  }
  /** Show a service: remember it as the last used in its goal, count the tap for the goal order (next time the app opens), reset the page. */
  const switchTo = (id: LayerId, viaGoal: boolean) => {
    const g = goalOf(id).id
    if (viaGoal) track('goal', g)
    track('tab', id)
    lsSet('taps', JSON.stringify(bumpTap(parseTaps(lsGet('taps')), g)))
    lsSet('last', JSON.stringify({ ...parseLast(lsGet('last')), [g]: id }))
    setLayerId(id); lsSet('layer', id); setSelected(null); setCat(catStart(id)); setLineSel(null)
    reset()
    if (level === CLOSED) setLevel(PEEK)
    viewport.current?.scrollTo({ top: 0 })
  }
  /** A service chip: switches service inside the goal. The chip of the service you are on does nothing. */
  const pickLayer = (id: LayerId) => {
    askLocation()
    if (id === layerId) { if (page !== 'home') reset(); return }
    switchTo(id, false)
  }
  /** A goal tab: opens the service last used in that goal. The tab of the goal you are on opens a closed sheet or folds an open one one step down. */
  const pickGoal = (g: GoalId) => {
    askLocation()
    if (g === goalOf(layerId).id) {
      if (page === 'home' && !desktop) setLevel(l => (l === CLOSED ? PEEK : l - 1))
      else reset()
      return
    }
    switchTo(serviceFor(goalById(g), parseLast(lsGet('last'))), true)
  }
  // a map marker or one of the two places under the card: show its card at peek, with the place and you both framed above the sheet (only the place when your position is unknown)
  const select = (id: string) => {
    track('select', layerId)
    setSelected(id)
    setPick(n => n + 1)
    const it = arr.find(i => i.id === id)
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
    // the "add to home screen" hint: once, and only in a normal browser tab (not inside another app, not when installed)
    if (!lsGet('hinted') && canShowInstallHint(installEnv())) {
      lsSet('hinted', '1')
      setTimeout(() => toasts.add({ title: t.installHint, data: { close: t.installClose } }), 1200)
    }
  }
  const turnTo = (p: Page) => { go(p); raise() }
  const back = () => { goUp() }
  // Escape and the back gesture: up one page, then lower the sheet one step
  const escape = () => { if (view.isOpen) return; if (lineSel) return lineBack(); if (!goUp()) setLevel(l => Math.max(CLOSED, l - 1)) }
  const cycle = () => setLevel(l => (l === CLOSED ? PEEK : l === PEEK ? FULL : PEEK))
  const levelOf = (v: string | number | null) => { const i = v == null ? -1 : snapPoints.indexOf(v); return i < 0 ? null : i }

  const pageEl = (() => {
    switch (page) {
      case 'place': return <PlacePage layer={layer} item={focus} hasPos={!!pos} onBack={back} onWalk={onWalk} locked={mobileLow} />
      default: return (
        <HomePage
          layer={layer} liveState={liveState} onRetry={() => setDutyTry(n => n + 1)} arr={arr} allClosed={allClosed} allOut={allOut} denied={denied} bizi={bizi} focus={focus} selected={chosen ? chosen.id : null} hasPos={!!pos} origin={pos ?? CENTER} locating={locating} nearby={nearby} peekRef={setPeekEl}
          routes={routes} times={times} onLine={pickLine} lineView={lineData?.view ?? null} onLineBack={lineBack} onLineDir={lineDir}
          openOnly={openOnly} setOpenOnly={setOpenOnly} showRange={showRange} setShowRange={setShowRange} cat={cat} setCat={c => { setCat(c); setSelected(null) }}
          locked={mobileLow} viewportRef={viewport}
          onPick={pickLayer} onGoal={pickGoal} goalOrder={goalOrder} onSelect={select} onLocate={doLocate} onDetails={() => turnTo('place')} onWalk={onWalk} onAbout={() => view.open('about')}
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
            <MapView
              layer={layer} items={lineData ? [] : arr} pick={pick} selected={lineData ? null : chosen ? chosen.id : focus?.id ?? null} userPos={pos} fly={fly} inset={insetPx}
              showRange={showRange} desktop={desktop} onSelect={select} onBackgroundClick={mapTap} route={lineData?.route ?? null} track={track_} fitN={fitN} vehicles={vehicles} vehBadge={t.vehBadge} onRouteStop={lineStop} label={t.map} zoomTitles={zoomTitles}
            />
          </div>
          {desktop ? (
            <aside aria-label={t.panel} data-testid="panel" className="absolute inset-y-0 left-0 z-10 flex w-[400px] flex-col border-r border-line bg-paper shadow-[2px_0_14px_rgb(0_0_0/0.12)]">
              <PageFrame turn={turn} pageRef={pageRef}>{pageEl}</PageFrame>
            </aside>
          ) : (
            <SheetClosedCtx.Provider value={mobileClosed}>
              <PagedDrawer snapPoints={snapPoints} snap={snapPoints[level]} onSnap={v => { const l = levelOf(v); if (l != null) setLevel(l) }} onEscape={escape} onFlickDown={() => setLevel(l => Math.max(CLOSED, l - 1))} turn={turn} pageRef={pageRef} handleLabel={t.handle} title={t.title} onHandle={cycle}>
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
