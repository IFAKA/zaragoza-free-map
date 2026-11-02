import { Button as BaseButton } from '@base-ui/react/button'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Tabs } from '@base-ui/react/tabs'
import { ArrowUpRight, CaretLeft, CaretRight, Check, Crosshair, GearSix, Translate, Info as InfoIcon, Thermometer } from '@phosphor-icons/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { DATA, dataRefreshed } from '../data'
import { revealDelta } from '../lib/reveal'
import { track } from '../lib/analytics'
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

/** Climate-shelter tag and the plain note. Not an official programme claim: it only says the building is public and has climate control. */
function ShelterNote() {
  const { t } = useT()
  return (
    <div className="flex flex-col items-start gap-1" data-testid="shelter-note">
      <span className="inline-flex items-center gap-1 rounded-full bg-shelter px-2.5 py-0.5 text-[0.8em] font-bold text-on-brand"><Thermometer size="1.1em" weight="fill" aria-hidden />{t('shelterTag')}</span>
      <span className={sub}>{t('shelterNote')}</span>
    </div>
  )
}

const DIST_MIN = 'min'

// ---------- tabs ----------
/** One fixed row of 6 equal category cells. No scrolling; nothing moves when a tab is selected. Settings is a button in the header, not a tab. */
export function NeedTabs({ layer, onPick }: { layer: LayerId; onPick: (id: LayerId) => void }) {
  const { lang, t } = useT()
  const tab = 'group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-0 text-ink [transition:color_120ms_var(--ease-out),transform_120ms_var(--ease-out)] active:scale-[.97] data-[active]:text-brand-text'
  const label = 'max-w-full border-b-2 border-transparent pb-px text-[0.8em] font-semibold leading-tight group-data-[active]:border-brand'
  return (
    <Tabs.Root value={layer} className="flex shrink-0 border-b border-line">
      <Tabs.List className="grid min-w-0 flex-1" style={{ gridTemplateColumns: `repeat(${ORDER.length}, minmax(0, 1fr))` }} aria-label={t('tabsLabel')}>
        {ORDER.map(id => {
          const I = ICONS[LAYERS[id].icon]
          return (
            <Tabs.Tab key={id} value={id} className={tab} onClick={() => onPick(id)} data-testid={`tab-${id}`} aria-label={LAYERS[id].label[lang]} title={LAYERS[id].label[lang]}>
              <I size="1.6em" weight={layer === id ? 'fill' : 'regular'} aria-hidden /><span className={label}>{LAYERS[id].short[lang]}</span>
            </Tabs.Tab>
          )
        })}
      </Tabs.List>
    </Tabs.Root>
  )
}

/** The home page title row with the Settings button (gear, 44px) at the right. */
function HomeHeader({ onSettings, desktop }: { onSettings: () => void; desktop: boolean }) {
  const { t } = useT()
  return (
    <div className={cn('flex shrink-0 items-center justify-between gap-2 pl-4 pr-1', desktop ? 'pt-2' : 'border-b border-line')}>
      <div className="min-w-0 truncate font-title text-[1.15em] font-bold text-brand-text">{t('title')} · {t('subtitle')}</div>
      <BaseButton onClick={onSettings} aria-label={t('settings')} title={t('settings')} data-testid="open-settings" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-brand-text [transition:transform_120ms_var(--ease-out)] active:scale-[.97]">
        <GearSix size="1.5em" aria-hidden />
      </BaseButton>
    </div>
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
    <li className={cn('relative scroll-mt-2 scroll-mb-2 border-b border-line', selected && 'bg-brand-tint')} data-id={item.id}>
      <BaseButton onClick={onSelect} className="grid min-h-14 w-full grid-cols-[1fr_auto] items-center gap-x-3 border-0 bg-transparent px-4 py-2 text-left text-ink after:absolute after:inset-0 hov:bg-surface">
        <span className="min-w-0">
          <span className="block truncate font-bold">{item.name || type(item.type)}</span>
          <span className={cn(sub, 'block truncate')}>{item.name ? type(item.type) : item.note}{layer.hours ? ' · ' : ''}{layer.hours && <Status item={item} layer={layer} />}</span>
        </span>
        <span className="whitespace-nowrap text-right font-bold">{fmtDist(item.d)}<span className={cn(sub, 'block font-normal')}>{walkMins(item.d)} {DIST_MIN}</span></span>
      </BaseButton>
      {item.type === 'lib' && <div className="pointer-events-none relative px-4 pb-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto"><Occupancy item={item} /></div>}
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
  viewportRef?: React.Ref<HTMLDivElement>; desktop: boolean
}) {
  const { t } = useT()
  const listRef = useRef<HTMLUListElement>(null)
  const rowOf = (id: string) => listRef.current ? Array.from(listRef.current.children).find(c => (c as HTMLElement).dataset.id === id) as HTMLElement | undefined : undefined
  const viewportOf = () => listRef.current?.closest<HTMLElement>('[data-testid="scroll"]') ?? null
  const pending = useRef<string | null>(null)
  /** Scroll the list the minimum so the pending row is fully visible (nothing if it already is). */
  const reveal = () => {
    const id = pending.current; const v = viewportOf(); const row = id ? rowOf(id) : undefined
    if (!v || !row) return
    const vr = v.getBoundingClientRect(); const rr = row.getBoundingClientRect()
    const d = revealDelta(rr.top, rr.bottom, vr.top, vr.bottom)
    if (Math.abs(d) < 1) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    v.scrollBy({ top: d, behavior: calm ? 'auto' : 'smooth' })
  }
  // a new selection (row tap or map marker): reveal its row now, and again whenever the list viewport resizes
  // (the sheet grows from peek to half over 450 ms), until the sheet has settled or the user scrolls
  useLayoutEffect(() => {
    if (!p.selected) { pending.current = null; return }
    pending.current = p.selected
    reveal()
    const v = viewportOf()
    if (!v) return
    const ro = new ResizeObserver(reveal)
    ro.observe(v)
    const stop = () => { pending.current = null }
    v.addEventListener('wheel', stop, { passive: true }); v.addEventListener('touchstart', stop, { passive: true })
    const timer = setTimeout(() => { reveal(); stop(); ro.disconnect() }, 700)
    return () => { clearTimeout(timer); ro.disconnect(); v.removeEventListener('wheel', stop); v.removeEventListener('touchstart', stop) }
  }, [p.selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {p.desktop && <HomeHeader onSettings={p.onSettings} desktop />}
      <NeedTabs layer={p.layer.id} onPick={p.onPick} />
      {!p.desktop && <HomeHeader onSettings={p.onSettings} desktop={false} />}
      <div className="shrink-0">
        <NearestBlock layer={p.layer} item={p.focus} isSelected={!!p.selected} hasPos={p.hasPos} locating={p.locating} onLocate={p.onLocate} onDetails={p.onDetails} onWalk={p.onWalk} />
        <Separator />
      </div>
      <Scroll locked={p.locked} viewportRef={p.viewportRef}>
        <Controls layer={p.layer} openOnly={p.openOnly} setOpenOnly={p.setOpenOnly} showRange={p.showRange} setShowRange={p.setShowRange} cat={p.cat} setCat={p.setCat} />
        <div className={cn(overline, 'border-y border-line bg-surface px-4 py-2')}>{p.arr.length} {t('places')}</div>
        <ul ref={listRef} className="m-0 list-none p-0" data-testid="list">
          {p.arr.slice(0, p.limit).map(it => <Row key={it.id} item={it} layer={p.layer} selected={it.id === (p.selected ?? p.focus?.id)} onSelect={() => p.onSelect(it.id)} />)}
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
            <li>{t('creditsCity')}</li><li>{t('creditsFountains')}</li><li>{t('creditsOsm')}</li><li>{t('creditsShelters')} ({DATA.shelters.updated})</li><li>{t('creditsTgo')}</li><li>{t('creditsTiles')}</li>
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
          {item.shelter && <ShelterNote />}
          <div className="flex flex-wrap gap-2">
            <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk}>{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
            <Button variant="secondary" {...linkProps(reportUrl(item))} onClick={() => track('report')}>{t('report')}</Button>
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
