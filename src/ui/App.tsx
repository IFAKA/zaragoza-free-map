import { Button } from '@base-ui/react/button'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getVersion, loadAll, retryLayer, runtime, subscribe } from '../layer-data'
import { lsGet, lsSet } from '../lib/cache'
import { initialLang, type Lang } from '../lib/i18n'
import { nearestOf, rank } from '../lib/rank'
import type { LatLon, LayerId } from '../lib/types'
import { press } from './cls'
import { Foot } from './Foot'
import { Hint } from './Hint'
import { Home } from './Home'
import { LangCtx, useT } from './lang'
import { LayerHead, LayerList } from './LayerView'
import { MapView, type FlyRequest } from './MapView'
import { useLocation } from './useLocation'
import { useSheet } from './useSheet'

const PAGE = 25

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  return (
    <LangCtx.Provider value={lang}>
      <Shell lang={lang} setLang={l => { setLang(l); lsSet('lang', l) }} />
    </LangCtx.Provider>
  )
}

function Shell({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { t } = useT()
  const version = useSyncExternalStore(subscribe, getVersion)
  const sheet = useSheet()
  const loc = useLocation()
  const [view, setView] = useState<LayerId | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [openOnly, setOpenOnly] = useState(false)
  const [cat, setCat] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [fly, setFly] = useState<FlyRequest | null>(null)
  const [hint, setHint] = useState(false)
  const flyN = useRef(0)
  const pending = useRef(false) // a need was tapped and the nearest item is not picked yet

  const rt = view ? runtime[view] : null
  const arr = useMemo(
    () => (rt ? rank(rt.cfg, rt.items, { ref: loc.pos, openOnly, cat }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt, version, loc.pos, openOnly, cat],
  )

  const doFly = useCallback((to: LatLon, zoom: number, fitUser?: LatLon) => setFly({ n: ++flyN.current, to, zoom, fitUser }), [])

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    // already granted: locate without asking
    void loc.alreadyGranted().then(async ok => { if (!ok) return; const p = await loc.locate(); if (p && !pending.current) doFly(p, 16) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // pick the nearest item once we know where the user is (or know we will not)
  useEffect(() => {
    if (!pending.current || !rt || loc.locating || !arr.length) return
    const n = nearestOf(rt.cfg, arr, !!rt.parts.city?.live)
    if (!n) return
    pending.current = false
    setSelected(n.id)
    doFly([n.lat, n.lon], 17, loc.pos && n.d < 4000 ? loc.pos : undefined)
  }, [arr, rt, loc.locating, loc.pos, doFly])

  const openLayer = (id: LayerId) => {
    setView(id); setSelected(null); setLimit(PAGE); setCat(null); pending.current = true
    sheet.snapTo(1)
    if (!loc.pos && !loc.denied && !loc.locating) void loc.locate()
    sheet.listRef.current?.scrollTo({ top: 0 })
  }
  const back = () => { setView(null); setSelected(null); pending.current = false; sheet.snapTo(1) }

  const select = (id: string, fromMap: boolean) => {
    pending.current = false
    setSelected(id)
    const it = arr.find(x => x.id === id)
    if (!it) return
    if (fromMap) {
      if (sheet.cur === 2) sheet.snapTo(1)
      requestAnimationFrame(() => {
        const c = sheet.listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
        if (c) sheet.listRef.current?.scrollTo({ top: Math.max(0, c.offsetTop - 4), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      })
    } else {
      sheet.snapTo(1)
      doFly([it.lat, it.lon], 17)
    }
  }

  const onWalk = () => {
    if (lsGet('walked')) return
    lsSet('walked', '1')
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    if (!standalone && !lsGet('hint-closed')) setHint(true)
  }
  const closeHint = () => { setHint(false); lsSet('hint-closed', '1') }

  const locateBtn = () => void loc.locate().then(p => { if (p && !view) doFly(p, 16) })
  const dzTitle = sheet.dragProps(false)
  const dzMeta = sheet.dragProps(false)
  const s = rt ? { rt, arr, selected, openOnly, cat, locating: loc.locating, hasPos: !!loc.pos, note: loc.denied && !loc.pos ? t('denied') : '' } : null

  return (
    <div className="relative h-dvh overflow-hidden min-[900px]:flex">
      <MapView
        layer={rt?.cfg ?? null} items={arr} selected={selected} userPos={loc.pos} fly={fly} inset={sheet.inset}
        onSelect={id => select(id, true)} onBackgroundClick={() => { if (sheet.cur === 0) sheet.snapTo(1) }} label={t('map')}
      />
      <section
        ref={sheet.sheetRef}
        className={`absolute inset-x-0 bottom-0 z-[2] flex h-[88dvh] translate-y-[var(--ty,0px)] flex-col rounded-t-2xl bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_14px_rgba(0,0,0,.25)] transition-transform duration-[280ms] ease-sheet will-change-transform motion-reduce:transition-none min-[900px]:relative min-[900px]:order-0 min-[900px]:h-full min-[900px]:w-[400px] min-[900px]:translate-y-0! min-[900px]:rounded-none min-[900px]:shadow-[2px_0_12px_rgba(0,0,0,.15)] ${sheet.cur === 0 ? 'is-full' : ''}`}
      >
        <button {...sheet.dragProps(true)} onKeyDown={sheet.onHandleKey} aria-label={t('handle')} aria-expanded={sheet.cur === 0} className="w-full cursor-grab touch-none border-0 bg-transparent pb-2.5 pt-3 min-[900px]:hidden">
          <span className="mx-auto block h-[5px] w-11 rounded-[3px] bg-line" />
        </button>
        <div className="flex-none px-3.5 pb-2 min-[900px]:pt-3">
          <div className="flex touch-none items-center gap-2" {...dzTitle}>
            <h1 className="m-0 flex-1 text-[17px]">{rt ? <><span aria-hidden>{rt.cfg.icon} </span>{rt.cfg.label[lang]}</> : t('title')}</h1>
            <Button onClick={() => setLang(lang === 'en' ? 'es' : 'en')} aria-label={t('langSwitch')} className={`${press} min-h-11 min-w-11 rounded-lg border border-line bg-chip font-semibold`}>{lang === 'en' ? 'ES' : 'EN'}</Button>
          </div>
          {s ? (
            <LayerHead
              s={s} dz={dzMeta} onBack={back} onOpenOnly={setOpenOnly} onCat={c => { setCat(c); setLimit(PAGE) }}
              onRetry={() => { pending.current = true; retryLayer(s.rt.cfg.id) }} onWalk={onWalk}
            />
          ) : <Home onPick={openLayer} locating={loc.locating} located={!!loc.pos} onLocate={locateBtn} />}
          {hint && <Hint onClose={closeHint} />}
        </div>
        <ul ref={sheet.listRef} className={`m-0 min-h-0 flex-1 list-none overscroll-contain border-t border-line p-0 [-webkit-overflow-scrolling:touch] ${sheet.cur === 0 ? 'overflow-y-auto' : 'overflow-y-hidden'} min-[900px]:overflow-y-auto`}>
          {s && <LayerList s={s} limit={limit} onMore={() => setLimit(l => l + PAGE)} onSelect={id => select(id, false)} onWalk={onWalk} />}
          <Foot />
        </ul>
      </section>
    </div>
  )
}
