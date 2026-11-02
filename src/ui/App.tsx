import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lsGet, lsSet } from '../lib/cache'
import { initialLang, DICT, type Lang } from '../lib/i18n'
import { nowMadrid } from '../lib/hours'
import { rank } from '../lib/rank'
import type { LatLon, LayerId } from '../lib/types'
import { LAYERS } from '../layers'
import { LangCtx } from './lang'
import { SheetClosedCtx } from './sheet'
import { MapView, type FlyRequest } from './MapView'
import { PageFrame, PagedDrawer, usePages } from './PagedDrawer'
import { AboutPage, HomePage, LanguagePage, PlacePage, SettingsPage } from './Pages'
import { ToastHost, toasts } from './ToastHost'
import { useLocation } from './useLocation'

type Page = 'home' | 'settings' | 'language' | 'about' | 'place'

// Drawer levels. Closed shows only the tab bar; peek adds the nearest place; half shows the controls too; full is the whole list.
const CLOSED = 0, PEEK = 1, HALF = 2, FULL = 3
const PEEK_PX = 284, HALF_PX = 500
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
  const [layerId, setLayerId] = useState<LayerId>(() => saved<LayerId>('layer', 'water', s => (isLayer(s) ? s : undefined)))
  const [openOnly, setOpenOnlyS] = useState(() => saved('open', true, s => s !== '0'))
  const [showRange, setShowRangeS] = useState(() => saved('range', true, s => s !== '0'))
  const [cat, setCat] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [limit, setLimit] = useState(30)
  const [level, setLevel] = useState(PEEK)
  const [fly, setFly] = useState<FlyRequest | null>(null)
  const [tick, setTick] = useState(0)
  const { pos, locating, locate, alreadyGranted } = useLocation()
  const flyN = useRef(0)
  const viewport = useRef<HTMLDivElement>(null)

  const layer = LAYERS[layerId]
  const zoomTitles = useMemo(() => ({ in: t.zoomIn, out: t.zoomOut }), [t])
  const setLang = (l: Lang) => { setLangState(l); lsSet('lang', l); document.documentElement.lang = l }
  const setOpenOnly = (v: boolean) => { setOpenOnlyS(v); lsSet('open', v ? '1' : '0') }
  const setShowRange = (v: boolean) => { setShowRangeS(v); lsSet('range', v ? '1' : '0') }

  useEffect(() => { document.documentElement.lang = lang; document.title = `${t.title} · ${t.subtitle}` }, [lang, t])
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 60_000); return () => clearInterval(i) }, [])

  const { page, go, goUp, reset, turn, pageRef } = usePages<Page>('home')
  const mobileLow = !desktop && level !== FULL
  const closedPx = useClosedPx(desktop || lang)
  const snapPoints = useMemo<(string | number)[]>(() => [closedPx, PEEK_PX + 'px', HALF_PX + 'px', 1], [closedPx])
  const mobileClosed = !desktop && level === CLOSED
  // a closed sheet shows only the tab bar, so it always closes onto the first page
  useEffect(() => { if (mobileClosed) reset() }, [mobileClosed, reset])

  const arr = useMemo(
    () => rank(layer, layer.items, { ref: pos, openOnly, cat: layer.cats && cat !== 'all' ? cat : null }, nowMadrid()),
    // tick re-evaluates open/closed as the minutes pass
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, pos, openOnly, cat, tick])
  const chosen = selected ? arr.find(i => i.id === selected) ?? null : null
  const focus = chosen ?? arr[0] ?? null

  const insetPx = useCallback(() => {
    if (desktop) return 0
    return level === CLOSED ? closedPx : level === PEEK ? PEEK_PX : HALF_PX
  }, [desktop, level, closedPx])

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
  const pickLayer = (id: LayerId) => {
    // the tab of the layer you are already on: opens a closed sheet, folds an open one one step down
    if (id === layerId && page === 'home' && !desktop) { setLevel(l => (l === CLOSED ? HALF : l - 1)); return }
    setLayerId(id); lsSet('layer', id); setSelected(null); setCat('all'); setLimit(30)
    reset()
    if (level === CLOSED) setLevel(HALF)
    viewport.current?.scrollTo({ top: 0 })
  }
  // a list row or a map marker: show its card at half, with the place and you both framed above the sheet (only the place when your position is unknown)
  const select = (id: string) => {
    setSelected(id)
    const it = arr.find(i => i.id === id)
    if (!desktop) setLevel(HALF)
    if (it) pos ? flyTo([it.lat, it.lon], 17, { fitUser: pos }) : flyTo([it.lat, it.lon], 18)
    // no scroll to top: the list keeps the tapped row in place (see HomePage)
  }
  // a tap on the bare map lowers the sheet one step: full/half to peek, peek to closed
  const mapTap = () => {
    setSelected(null)
    if (!desktop) setLevel(l => (l === FULL ? PEEK : Math.max(CLOSED, l - 1)))
  }
  const doLocate = async () => {
    const p = await locate()
    if (!p) toasts.add({ title: t.deniedTitle, description: t.deniedBody, data: { close: t.close } })
  }
  const onWalk = () => {
    if (!lsGet('hinted')) {
      lsSet('hinted', '1')
      setTimeout(() => toasts.add({ title: t.installHint, data: { close: t.installClose } }), 1200)
    }
  }
  const turnTo = (p: Page) => { go(p); raise() }
  const back = () => { goUp() }
  // Escape and the back gesture: up one page, then lower the sheet one step
  const escape = () => { if (!goUp()) setLevel(l => Math.max(CLOSED, l - 1)) }
  const cycle = () => setLevel(l => (l === CLOSED || l === PEEK ? HALF : l === HALF ? FULL : PEEK))
  const levelOf = (v: string | number | null) => { const i = v == null ? -1 : snapPoints.indexOf(v); return i < 0 ? null : i }

  const pageEl = (() => {
    switch (page) {
      case 'settings': return <SettingsPage lang={lang} onBack={back} locked={mobileLow} go={turnTo} />
      case 'language': return <LanguagePage lang={lang} setLang={setLang} onBack={back} locked={mobileLow} />
      case 'about': return <AboutPage onBack={back} locked={mobileLow} />
      case 'place': return <PlacePage layer={layer} item={focus} hasPos={!!pos} onBack={back} onWalk={onWalk} locked={mobileLow} />
      default: return (
        <HomePage
          layer={layer} arr={arr} focus={focus} selected={chosen ? chosen.id : null} hasPos={!!pos} locating={locating}
          openOnly={openOnly} setOpenOnly={setOpenOnly} showRange={showRange} setShowRange={setShowRange} cat={cat} setCat={c => { setCat(c); setSelected(null) }}
          limit={limit} onMoreRows={() => setLimit(l => l + 40)} locked={mobileLow} viewportRef={viewport}
          onPick={pickLayer} onSettings={() => turnTo('settings')} onSelect={select} onLocate={doLocate} onDetails={() => turnTo('place')} onWalk={onWalk} onAbout={() => turnTo('about')}
          title={desktop ? <div className="px-4 pb-1 pt-4"><div className="font-title text-[1.15em] font-bold text-brand-text">{t.title} · {t.subtitle}</div></div> : undefined}
        />
      )
    }
  })()

  return (
    <LangCtx.Provider value={lang}>
      <ToastHost>
        <div className="fixed inset-0 overflow-hidden bg-surface" data-desktop={desktop ? '' : undefined}>
          <div className={desktop ? 'absolute inset-y-0 right-0 left-[400px]' : 'absolute inset-0'}>
            <MapView
              layer={layer} items={arr} selected={chosen ? chosen.id : focus?.id ?? null} userPos={pos} fly={fly} inset={insetPx}
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
      </ToastHost>
    </LangCtx.Provider>
  )
}
