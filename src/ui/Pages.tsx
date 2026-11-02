import { Button as BaseButton } from '@base-ui/react/button'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Tabs } from '@base-ui/react/tabs'
import { ArrowUpRight, CaretLeft, CaretRight, Check, Crosshair, GearSix, Translate, Info as InfoIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { dataRefreshed } from '../data'
import { anchoredScrollTop } from '../lib/anchor'
import { lsGet, lsSet } from '../lib/cache'
import { fmtDist, walkMins, walkUrl } from '../lib/geo'
import type { Key, Lang } from '../lib/i18n'
import type { LayerConfig, LayerId, RankedItem } from '../lib/types'
import { LAYERS, ORDER } from '../layers'
import { rangeMetres } from './MapView'
import { BUZ_URL, fmtHours, reportUrl, srcExplain, srcLabel } from './labels'
import { ICONS } from './icons'
import { useT } from './lang'
import { Button, Chips, InfoPop, Scroll, Separator, Switch, linkProps } from './ui/kit'
import { cn } from './cn'

const h2 = 'font-title text-[1.4em] font-semibold leading-tight text-brand-text'
const overline = 'text-[0.8em] font-semibold uppercase tracking-wide text-ink-soft'
const sub = 'text-[0.93em] leading-snug text-ink-soft'

// ---------- shared small pieces ----------
export function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useT()
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-3">
      <BaseButton onClick={onBack} aria-label={t('back')} data-testid="back" className="inline-flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-brand-text active:scale-95">
        <CaretLeft size="1.4em" weight="bold" aria-hidden />
      </BaseButton>
      <h1 className={h2}>{title}</h1>
    </div>
  )
}

function Status({ item, layer }: { item: RankedItem; layer: LayerConfig }) {
  const { t } = useT()
  if (!layer.hours) return null
  if (item.always) return <span className="font-bold text-success-ink">{t('alwaysOn')}</span>
  if (item.open === true) return <span className="font-bold text-success-ink">{t('open')}</span>
  if (item.open === false) return <span className="font-bold text-warn-ink">{t('closed')}</span>
  return <span className="font-semibold text-ink-soft">{t('hoursUnknown')}</span>
}

/** Libraries: a live-occupancy link where one exists (University of Zaragoza), an honest "not published" otherwise. */
function Occupancy({ item }: { item: RankedItem }) {
  const { t } = useT()
  if (item.type !== 'lib') return null
  if (item.buz) {
    return <a href={BUZ_URL} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 font-bold text-brand-text underline-offset-2 hov:underline">{t('occLive')} <ArrowUpRight size="1em" weight="bold" aria-hidden /></a>
  }
  return <span className="inline-flex items-center"><span className={sub}>{t('occNone')}</span><InfoPop label={t('occInfoTitle')} title={t('occInfoTitle')}>{t('occInfo')}</InfoPop></span>
}

const DIST_MIN = 'min'

// ---------- tabs ----------
/** One scrollable row: every service, then Settings. Fades at an edge hint that more tabs are off-screen; the active tab is scrolled into view. */
export function NeedTabs({ layer, onPick, onSettings }: { layer: LayerId; onPick: (id: LayerId) => void; onSettings: () => void }) {
  const { lang, t } = useT()
  const list = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  const [edge, setEdge] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const e = list.current
    if (e) setEdge({ left: e.scrollLeft > 4, right: e.scrollLeft + e.clientWidth < e.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    const e = list.current
    if (!e) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(e)
    return () => ro.disconnect()
  }, [measure])
  useEffect(() => {
    const e = list.current, a = e?.querySelector<HTMLElement>('[data-active]')
    if (!e || !a) return
    const left = Math.max(0, Math.min(e.scrollWidth - e.clientWidth, a.offsetLeft - (e.clientWidth - a.offsetWidth) / 2))
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    e.scrollTo({ left, behavior: first.current || reduced ? 'auto' : 'smooth' })
    first.current = false
  }, [layer])
  // once per device: a short nudge shows that the row scrolls
  useEffect(() => {
    const e = list.current
    if (!e || lsGet('tabsNudged') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let back = 0
    const go = setTimeout(() => {
      if (e.scrollWidth - e.clientWidth < 8) return
      lsSet('tabsNudged', '1')
      const from = e.scrollLeft
      e.style.scrollSnapType = 'none' // else the snap pulls the 40px nudge straight back
      e.scrollTo({ left: from + 40, behavior: 'smooth' })
      back = window.setTimeout(() => { e.scrollTo({ left: from, behavior: 'smooth' }); setTimeout(() => { e.style.scrollSnapType = '' }, 500) }, 450)
    }, 900)
    return () => { clearTimeout(go); clearTimeout(back) }
  }, [])
  const step = (dir: 1 | -1) => {
    const e = list.current
    if (e) e.scrollBy({ left: dir * e.clientWidth * 0.6, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const tab = 'group relative flex min-h-14 w-[4.8rem] shrink-0 snap-start flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-0.5 text-ink [transition:transform_120ms_var(--ease-out)] active:scale-[.95] data-[active]:text-brand-text'
  const label = 'max-w-full truncate border-b-2 border-transparent pb-px text-[0.8em] font-semibold leading-tight group-data-[active]:border-brand'
  const fade = 'pointer-events-none absolute inset-y-0 w-[44px] from-paper via-paper/80 to-transparent transition-opacity duration-150'
  const chev = 'absolute inset-y-0 z-10 flex w-[44px] items-center border-0 bg-transparent p-0 text-brand-text transition-opacity duration-150 active:opacity-60'
  return (
    <Tabs.Root value={layer} className="relative shrink-0 border-b border-line">
      <Tabs.List ref={list} onScroll={measure} className="flex snap-x snap-proximity overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t('tabsLabel')}>
        {ORDER.map(id => {
          const I = ICONS[LAYERS[id].icon]
          return (
            <Tabs.Tab key={id} value={id} className={tab} onClick={() => onPick(id)} data-testid={`tab-${id}`}>
              <I size="1.6em" weight={layer === id ? 'fill' : 'regular'} aria-hidden /><span className={label}>{LAYERS[id].label[lang]}</span>
            </Tabs.Tab>
          )
        })}
        <Tabs.Tab value="settings" className={tab} onClick={onSettings} data-testid="tab-settings">
          <GearSix size="1.6em" aria-hidden /><span className={label}>{t('settings')}</span>
        </Tabs.Tab>
      </Tabs.List>
      <div aria-hidden className={cn(fade, 'left-0 bg-linear-to-r', edge.left ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cn(fade, 'right-0 bg-linear-to-l', edge.right ? 'opacity-100' : 'opacity-0')} />
      {edge.left && <BaseButton onClick={() => step(-1)} aria-label={t('tabsPrev')} data-testid="tabs-prev" className={cn(chev, 'left-0 justify-start pl-1')}><CaretLeft size="1.4em" weight="bold" aria-hidden /></BaseButton>}
      {edge.right && <BaseButton onClick={() => step(1)} aria-label={t('tabsNext')} data-testid="tabs-next" className={cn(chev, 'right-0 justify-end pr-1')}><CaretRight size="1.4em" weight="bold" aria-hidden /></BaseButton>}
    </Tabs.Root>
  )
}

// ---------- the block with the nearest (or selected) place ----------
export function NearestBlock({ layer, item, isSelected, hasPos, locating, onLocate, onDetails, onWalk }: {
  layer: LayerConfig; item: RankedItem | null; isSelected: boolean; hasPos: boolean; locating: boolean
  onLocate: () => void; onDetails: () => void; onWalk: () => void
}) {
  const { t, type } = useT()
  if (!item) return <div className="px-4 py-5"><p className={cn(sub, 'm-0')}>{t('noneOpen')}</p></div>
  const kind = isSelected ? t('selected') : t(('nearest' + layer.id) as Key)
  return (
    <section className="px-4 pb-3 pt-4" data-testid="nearest" aria-label={kind}>
      <div className={overline}>{kind}</div>
      <h2 className={cn(h2, 'mt-1')} data-testid="nearest-name">{item.name || type(item.type)}</h2>
      <div className="mt-1 font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></div>
      <div className="mt-0.5"><Status item={item} layer={layer} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
        <Button variant="secondary" onClick={onDetails} data-testid="details">{t('details')}</Button>
      </div>
      {!hasPos && (
        <Button variant="link" onClick={onLocate} disabled={locating} className="mt-1" data-testid="locate"><Crosshair size="1.2em" aria-hidden />{locating ? t('locating') : t('useLocation')}</Button>
      )}
    </section>
  )
}

// ---------- list ----------
function Row({ item, layer, selected, onSelect }: { item: RankedItem; layer: LayerConfig; selected: boolean; onSelect: () => void }) {
  const { type } = useT()
  return (
    <li className={cn('scroll-mt-2 scroll-mb-2 border-b border-line', selected && 'bg-brand-tint')} data-id={item.id}>
      <BaseButton onClick={onSelect} className="grid min-h-14 w-full grid-cols-[1fr_auto] items-center gap-x-3 border-0 bg-transparent px-4 py-2 text-left text-ink hov:bg-surface">
        <span className="min-w-0">
          <span className="block truncate font-bold">{item.name || type(item.type)}</span>
          <span className={cn(sub, 'block truncate')}>{item.name ? type(item.type) : item.note}{layer.hours ? ' · ' : ''}{layer.hours && <Status item={item} layer={layer} />}</span>
        </span>
        <span className="whitespace-nowrap text-right font-bold">{fmtDist(item.d)}<span className={cn(sub, 'block font-normal')}>{walkMins(item.d)} {DIST_MIN}</span></span>
      </BaseButton>
      {item.type === 'lib' && <div className="px-4 pb-1"><Occupancy item={item} /></div>}
    </li>
  )
}

export function Controls({ layer, openOnly, setOpenOnly, showRange, setShowRange, cat, setCat }: {
  layer: LayerConfig; openOnly: boolean; setOpenOnly: (v: boolean) => void; showRange: boolean; setShowRange: (v: boolean) => void; cat: string; setCat: (c: string) => void
}) {
  const { t } = useT()
  if (!layer.hours && !layer.cats && layer.id !== 'bizi') return null
  return (
    <div className="px-4 pb-2">
      {layer.hours && <Switch checked={openOnly} onCheckedChange={setOpenOnly} label={t('openNow')} hint={t('openNowHint')} testId="switch-open" />}
      {layer.id === 'wifi' && <Switch checked={showRange} onCheckedChange={setShowRange} label={t('showRange')} hint={t('showRangeHint')} testId="switch-range" />}
      {layer.cats && <div className="mt-1"><Chips value={cat} onChange={setCat} label={t('typeLabel')} options={[{ value: 'all', label: t('all') }, ...layer.cats.map(c => ({ value: c, label: t(c as Key) }))]} /></div>}
      {layer.id === 'bizi' && <p className={cn(sub, 'm-0 py-1')}>{t('bizi')}</p>}
    </div>
  )
}

export function Footer({ onAbout }: { onAbout: () => void }) {
  const { t } = useT()
  const d = dataRefreshed()
  return (
    <footer className="px-4 pb-6 pt-3">
      <p className={cn(sub, 'm-0')}>{t('disclaimer')}</p>
      {d && <p className={cn(sub, 'm-0 mt-1')}>{t('dataRefreshed')}: {d}</p>}
      <Button variant="link" onClick={onAbout} className="-ml-1">{t('about')}</Button>
    </footer>
  )
}

export function HomePage(p: {
  layer: LayerConfig; arr: RankedItem[]; focus: RankedItem | null; selected: string | null; hasPos: boolean; locating: boolean
  openOnly: boolean; setOpenOnly: (v: boolean) => void; showRange: boolean; setShowRange: (v: boolean) => void; cat: string; setCat: (c: string) => void
  limit: number; onMoreRows: () => void; locked: boolean; onPick: (id: LayerId) => void; onSettings: () => void
  onSelect: (id: string) => void; onLocate: () => void; onDetails: () => void; onWalk: () => void; onAbout: () => void
  viewportRef?: React.Ref<HTMLDivElement>; title?: ReactNode
}) {
  const { t } = useT()
  const listRef = useRef<HTMLUListElement>(null)
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const clicked = useRef(false)
  const viewportOf = () => listRef.current?.closest<HTMLElement>('[data-testid="scroll"]') ?? null
  const rowOf = (id: string) => listRef.current ? Array.from(listRef.current.children).find(c => (c as HTMLElement).dataset.id === id) as HTMLElement | undefined : undefined
  /** Remember where a row is (relative to the scroll viewport) so we can put it back after the card above changes height. */
  const remember = (id?: string) => {
    const v = viewportOf(); const ul = listRef.current
    if (!v || !ul) return
    const vt = v.getBoundingClientRect().top
    const row = id ? rowOf(id) : Array.from(ul.children).find(c => c.getBoundingClientRect().bottom > vt + 1) as HTMLElement | undefined
    if (row) anchor.current = { id: row.dataset.id!, top: row.getBoundingClientRect().top - vt }
  }
  useLayoutEffect(() => {
    const v = viewportOf(); const a = anchor.current
    const row = a ? rowOf(a.id) : undefined
    if (v && a && row) {
      const now = row.getBoundingClientRect().top - v.getBoundingClientRect().top
      if (Math.abs(now - a.top) > 0.5) v.scrollTop = anchoredScrollTop(v.scrollTop, a.top, now)
    }
    // a pick from the map: make sure the row is visible, no movement if it already is
    if (!clicked.current && p.selected) rowOf(p.selected)?.scrollIntoView({ block: 'nearest' })
    clicked.current = false
    remember()
  }, [p.selected, p.focus?.id, p.hasPos]) // eslint-disable-line react-hooks/exhaustive-deps
  // keep the anchor current while the user scrolls
  useEffect(() => {
    const v = viewportOf()
    if (!v) return
    const on = () => remember()
    v.addEventListener('scroll', on, { passive: true })
    return () => v.removeEventListener('scroll', on)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {p.title}
      <NeedTabs layer={p.layer.id} onPick={p.onPick} onSettings={p.onSettings} />
      <Scroll locked={p.locked} viewportRef={p.viewportRef}>
        <NearestBlock layer={p.layer} item={p.focus} isSelected={!!p.selected} hasPos={p.hasPos} locating={p.locating} onLocate={p.onLocate} onDetails={p.onDetails} onWalk={p.onWalk} />
        <Separator />
        <Controls layer={p.layer} openOnly={p.openOnly} setOpenOnly={p.setOpenOnly} showRange={p.showRange} setShowRange={p.setShowRange} cat={p.cat} setCat={p.setCat} />
        <div className={cn(overline, 'border-y border-line bg-surface px-4 py-2')}>{p.arr.length} {t('places')}</div>
        <ul ref={listRef} className="m-0 list-none p-0" data-testid="list">
          {p.arr.slice(0, p.limit).map(it => <Row key={it.id} item={it} layer={p.layer} selected={it.id === (p.selected ?? p.focus?.id)} onSelect={() => { if (it.id !== (p.selected ?? p.focus?.id)) clicked.current = true; remember(it.id); p.onSelect(it.id) }} />)}
        </ul>
        {p.arr.length > p.limit && <div className="flex justify-center p-3"><Button variant="secondary" onClick={p.onMoreRows}>{t('showMore')}</Button></div>}
        <Footer onAbout={p.onAbout} />
      </Scroll>
    </>
  )
}

// ---------- More, Language, About, Place ----------
function PageRow({ icon, title, description, status, onClick, testId, active }: { icon: ReactNode; title: string; description?: string; status?: string; onClick: () => void; testId: string; active?: boolean }) {
  return (
    <BaseButton onClick={onClick} data-testid={testId} className={cn('flex min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-transparent px-4 py-2 text-left text-ink hov:bg-surface', active && 'bg-brand-tint')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface text-ink">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span>{description && <span className={cn(sub, 'block')}>{description}</span>}</span>
      {status && <span className={sub}>{status}</span>}
      <CaretRight size="1.2em" className="shrink-0 text-ink-soft" aria-hidden />
    </BaseButton>
  )
}

export function SettingsPage({ lang, onBack, go, locked }: { lang: Lang; onBack: () => void; go: (p: 'language' | 'about') => void; locked: boolean }) {
  const { t } = useT()
  return (
    <>
      <PageHeader title={t('settingsTitle')} onBack={onBack} />
      <Scroll locked={locked}>
        <PageRow testId="row-language" icon={<Translate size="1.4em" aria-hidden />} title={t('language')} status={lang === 'en' ? 'English' : 'Español'} onClick={() => go('language')} />
        <PageRow testId="row-about" icon={<InfoIcon size="1.4em" aria-hidden />} title={t('about')} onClick={() => go('about')} />
      </Scroll>
    </>
  )
}

export function LanguagePage({ lang, setLang, onBack, locked }: { lang: Lang; setLang: (l: Lang) => void; onBack: () => void; locked: boolean }) {
  const { t } = useT()
  return (
    <>
      <PageHeader title={t('langTitle')} onBack={onBack} />
      <Scroll locked={locked}>
        <RadioGroup value={lang} onValueChange={v => setLang(v as Lang)} aria-label={t('langTitle')}>
          {(['en', 'es'] as Lang[]).map(l => (
            <Radio.Root key={l} value={l} data-testid={`lang-${l}`} className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left font-bold text-ink hov:bg-surface">
              <span className="flex-1">{l === 'en' ? t('langEn') : t('langEs')}</span>
              <Radio.Indicator className="text-brand-text"><Check size="1.3em" weight="bold" aria-hidden /></Radio.Indicator>
            </Radio.Root>
          ))}
        </RadioGroup>
      </Scroll>
    </>
  )
}

export function AboutPage({ onBack, locked }: { onBack: () => void; locked: boolean }) {
  const { t } = useT()
  const d = dataRefreshed()
  return (
    <>
      <PageHeader title={t('aboutTitle')} onBack={onBack} />
      <Scroll locked={locked}>
        <div className="flex flex-col gap-3 px-4 pb-8 pt-2 leading-relaxed">
          <p className="m-0 font-bold">{t('disclaimer')}</p>
          <p className="m-0">{t('privacy')}</p>
          <p className="m-0">{t('noGuarantee')}</p>
          <h2 className="font-title text-[1.1em] font-semibold text-ink">{t('sources')}</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>{t('creditsCity')}</li><li>{t('creditsFountains')}</li><li>{t('creditsOsm')}</li><li>{t('creditsTgo')}</li><li>{t('creditsTiles')}</li>
          </ul>
          {d && <p className="m-0 font-bold" data-testid="refreshed">{t('dataRefreshed')}: {d}</p>}
          <a className="font-bold text-brand-text" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">{t('fixOsm')}</a>
        </div>
      </Scroll>
    </>
  )
}

export function PlacePage({ layer, item, hasPos, onBack, onWalk, locked }: { layer: LayerConfig; item: RankedItem | null; hasPos: boolean; onBack: () => void; onWalk: () => void; locked: boolean }) {
  const { t, type, lang } = useT()
  if (!item) return <PageHeader title={t('details')} onBack={onBack} />
  const tel = item.phone?.replace(/[^\d+]/g, '')
  const hoursRaw = item.sched ? item.sched.r : item.hours
  const hours = hoursRaw && fmtHours(lang, hoursRaw)
  const field = (k: Key, v: ReactNode) => v ? <div><div className={overline}>{t(k)}</div><div className="mt-0.5">{v}</div></div> : null
  return (
    <>
      <PageHeader title={item.name || type(item.type)} onBack={onBack} />
      <Scroll locked={locked}>
        <div className="flex flex-col gap-3 px-4 pb-8 pt-1">
          <div className={sub}>{type(item.type)}{item.cust ? ` · ${t('cust')}` : ''}{item.note ? ` · ${item.note}` : ''}</div>
          <div className="font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></div>
          <div><Status item={item} layer={layer} /></div>
          <div className="flex flex-wrap gap-2">
            <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk}>{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
            <Button variant="secondary" {...linkProps(reportUrl(item))}>{t('report')}</Button>
          </div>
          <Separator />
          {field('address', item.addr)}
          {field('hours', hours && <><span className="whitespace-pre-line">{hours.replace(/; /g, '\n')}</span><div className={sub}>{t('holidays')}</div></>)}
          {field('phone', tel && <a className="font-bold text-brand-text" href={`tel:${tel}`}>{item.phone}</a>)}
          {field('ssid', item.ssid)}
          {layer.id === 'wifi' && <div className={sub}>{t('rangeEst')} {item.building ? t('rangeCity') : t('rangeOsm')} ({rangeMetres(item)} m).</div>}
          <Occupancy item={item} />
          <div className="flex items-start gap-1"><div className={cn(sub, 'flex-1 pt-3')}>{t('source')}: {srcLabel(t, item)}</div><InfoPop label={t('srcInfo')} title={t('srcInfo')}>{srcExplain(t, item)}</InfoPop></div>
        </div>
      </Scroll>
    </>
  )
}
