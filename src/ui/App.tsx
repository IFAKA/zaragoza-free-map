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
import type { LatLon, LayerId } from '../lib/types'
import { LAYERS, defaultLayer } from '../layers'
import { dutyItems } from '../layers/build'
import { LangCtx } from './lang'
import { SheetClosedCtx } from './sheet'
import { MapView, type FlyRequest } from './MapView'
import { PageFrame, PagedDrawer, usePages } from './PagedDrawer'
import { HomePage, PlacePage } from './Pages'
import { SettingsView, useSettingsView } from './SettingsView'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { GOAL_IDS, goalById, goalOf, serviceFor, type GoalId } from '../layers/goals'
import { bumpTap, parseLast, parseTaps, rankByTaps } from '../lib/usage'
import { SettingsFab } from './SettingsFab'
import { ToastHost, toasts } from './ToastHost'
import { useBizi } from './useBizi'
import { useLocation } from './useLocation'

type Page = 'home' | 'place'

// Drawer levels. Closed shows only the tab bar; peek adds the nearest place; half shows the controls too; full is the whole list.
const CLOSED = 0, PEEK = 1, HALF = 2, FULL = 3
const PEEK_PX = 305, HALF_PX = 500 // measured with the goal tabs and service chips: the nearest card ends at 302-304 px of sheet on Toilets, Water and WiFi
const DEFAULT_CLOSED_PX = 78
/** Height of the closed sheet: the handle and the tab bar, plus the phone's bottom safe area. Measured, so it follows the real layout. */
function useClosedPx(dep: unknown) {
  const [px, setPx] = useState(DEFAULT_CLOSED_PX)
  useEffect(() => {
    const measure = () => {
      const pop = document.querySelector('[data-slot=drawer-popup]'), tabs = pop?.querySelector('[role=tablist]')
      if (!pop || !tabs) return
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
      document.body.appendChild(probe)
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0
      probe.remove()
      const next = Math.ceil(tabs.parentElement!.getBoundingClientRect().bottom - pop.getBoundingClientRect().top + inset)
      if (next > 40) setPx(old => (old === next ? old : next))
    }
    measure()
    const id = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', measure) }
  }, [dep])
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
  const [limit, setLimit] = useState(30)
  const [level, setLevel] = useState(PEEK)
  const [pick, setPick] = useState(0)
  const [fly, setFly] = useState<FlyRequest | null>(null)
  const [tick, setTick] = useState(0)
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
  const peekPx = layer.peek ?? PEEK_PX
  const snapPoints = useMemo<(string | number)[]>(() => [closedPx, peekPx + 'px', HALF_PX + 'px', 1], [closedPx, peekPx])
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

  const insetPx = useCallback(() => {
    if (desktop) return 0
    return level === CLOSED ? closedPx : level === PEEK ? peekPx : HALF_PX
  }, [desktop, level, closedPx, peekPx])

  const flyTo = useCallback((to: LatLon, zoom: number, o: Partial<FlyRequest> = {}) => setFly({ n: ++flyN.current, to, zoom, ...o }), [])

  // show the nearest place of the current layer whenever the layer or the filters change
  const first = arr[0]?.id
  useEffect(() => {
    const it = arr[0]
    if (!it) return
    flyTo([it.lat, it.lon], 16, pos ? { fitUser: pos } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, first, !!pos])

  // locate silently when the browser already allows it
  useEffect(() => { alreadyGranted().then(ok => { if (ok) locate() }) }, [alreadyGranted, locate])

  const raise = (min: number = HALF) => setLevel(l => Math.max(l, min))
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
    setLayerId(id); lsSet('layer', id); setSelected(null); setCat(catStart(id)); setLimit(30)
    reset()
    if (level === CLOSED) setLevel(HALF)
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
      if (page === 'home' && !desktop) setLevel(l => (l === CLOSED ? HALF : l - 1))
      else reset()
      return
    }
    switchTo(serviceFor(goalById(g), parseLast(lsGet('last'))), true)
  }
  // a list row or a map marker: show its card at half, with the place and you both framed above the sheet (only the place when your position is unknown)
  const select = (id: string) => {
    track('select', layerId)
    setSelected(id)
    setPick(n => n + 1)
    const it = arr.find(i => i.id === id)
    if (!desktop) setLevel(HALF)
    if (it) pos ? flyTo([it.lat, it.lon], 17, { fitUser: pos }) : flyTo([it.lat, it.lon], 18)
    // the list scrolls the row into view by itself (see HomePage)
  }
  // a tap on the bare map lowers the sheet one step: full/half to peek, peek to closed
  const mapTap = () => {
    setSelected(null)
    if (!desktop) setLevel(l => (l === FULL ? PEEK : Math.max(CLOSED, l - 1)))
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
  const escape = () => { if (view.isOpen) return; if (!goUp()) setLevel(l => Math.max(CLOSED, l - 1)) }
  const cycle = () => setLevel(l => (l === CLOSED || l === PEEK ? HALF : l === HALF ? FULL : PEEK))
  const levelOf = (v: string | number | null) => { const i = v == null ? -1 : snapPoints.indexOf(v); return i < 0 ? null : i }

  const pageEl = (() => {
    switch (page) {
      case 'place': return <PlacePage layer={layer} item={focus} hasPos={!!pos} onBack={back} onWalk={onWalk} locked={mobileLow} />
      default: return (
        <HomePage
          layer={layer} liveState={liveState} onRetry={() => setDutyTry(n => n + 1)} arr={arr} allClosed={allClosed} allOut={allOut} denied={denied} bizi={bizi} focus={focus} selected={chosen ? chosen.id : null} hasPos={!!pos} locating={locating}
          openOnly={openOnly} setOpenOnly={setOpenOnly} showRange={showRange} setShowRange={setShowRange} cat={cat} setCat={c => { setCat(c); setSelected(null) }}
          limit={limit} onMoreRows={() => setLimit(l => l + 40)} locked={mobileLow} viewportRef={viewport}
          onPick={pickLayer} onGoal={pickGoal} goalOrder={goalOrder} onSelect={select} onLocate={doLocate} onDetails={() => turnTo('place')} onWalk={onWalk} onAbout={() => view.open('about')}
          desktop={desktop}
        />
      )
    }
  })()

  return (
    <LangCtx.Provider value={lang}>
      <MotionConfig reducedMotion="user"><LazyMotion features={domAnimation} strict>
      <ToastHost>
        <div className="fixed inset-0 overflow-hidden bg-surface" data-desktop={desktop ? '' : undefined}>
          <div className={desktop ? 'absolute inset-y-0 right-0 left-[400px]' : 'absolute inset-0'}>
            <MapView
              layer={layer} items={arr} pick={pick} selected={chosen ? chosen.id : focus?.id ?? null} userPos={pos} fly={fly} inset={insetPx}
              showRange={showRange} desktop={desktop} onSelect={select} onBackgroundClick={mapTap} label={t.map} zoomTitles={zoomTitles}
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
    </LangCtx.Provider>
  )
}
