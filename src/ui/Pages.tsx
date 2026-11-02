import { Button as BaseButton } from '@base-ui/react/button'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { ArrowUpRight, CaretLeft, CaretRight, Check, X as CloseIcon, Crosshair, Translate, Info as InfoIcon, Thermometer } from '@phosphor-icons/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { DATA, dataRefreshed } from '../data'
import { revealDelta } from '../lib/reveal'
import { track } from '../lib/analytics'
import { fmtDist, walkMins, walkUrl } from '../lib/geo'
import type { Key, Lang } from '../lib/i18n'
import type { LayerConfig, LayerId, RankedItem } from '../lib/types'
import { LAYERS } from '../layers'
import type { GoalId } from '../layers/goals'
import { GoalTabs, ServiceChips } from './GoalBar'
import { Tick } from './Tick'
import { cardSwap, tap } from './motion'
import { m } from 'motion/react'
import { rangeMetres } from './MapView'
import { DUTY_PAGE, madridDate } from '../lib/duty'
import { BUZ_URL, biziLine, busUrl, clockMadrid, dotBetween, fmtHours, reportUrl, srcExplain, srcLabel } from './labels'
import type { useBizi } from './useBizi'
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
      <BaseButton onClick={onBack} aria-label={t('back')} data-testid="back" render={<m.button {...tap} />} className="inline-flex size-[44px] items-center justify-center rounded-full border-0 bg-transparent text-brand-text">
        <CaretLeft size="1.4em" weight="bold" aria-hidden />
      </BaseButton>
      <h1 className={h2}>{title}</h1>
    </div>
  )
}

/** Header of the full Settings view: title on the left, a close cross on the right (where the Settings button was). Sub-pages also get a small chevron to go up one level. */
function ViewHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  const { t } = useT()
  const btn = 'inline-flex size-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-brand-text'
  return (
    <div className="flex shrink-0 items-center gap-1 pb-1 pl-2 pt-[max(0.75rem,env(safe-area-inset-top))] mr-[calc(max(0.75rem,env(safe-area-inset-right))-env(safe-area-inset-right))]">
      {onBack && (
        <BaseButton onClick={onBack} aria-label={t('back')} data-testid="back" render={<m.button {...tap} />} className={btn}>
          <CaretLeft size="1.3em" weight="bold" aria-hidden />
        </BaseButton>
      )}
      <h1 className={h2 + (onBack ? '' : ' pl-2')}>{title}</h1>
      <BaseButton onClick={onClose} aria-label={t('close')} data-testid="close" render={<m.button {...tap} />} className={btn + ' ml-auto'}>
        <CloseIcon size="1.4em" weight="bold" aria-hidden />
      </BaseButton>
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

/** Bus stop buttons: ONE primary "Next buses" (opens the bus company page: its times page cannot be read by a browser, so we link out), then Walk. Rural stops have no live page. */
function BusActions({ item, onWalk }: { item: RankedItem; onWalk: () => void }) {
  const { t } = useT()
  const walk = <Button variant={item.stop ? 'secondary' : 'primary'} {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.stop && <Button {...linkProps(busUrl(item.stop))} onClick={() => track('times', 'bus')} data-testid="next-buses">{t('nextBuses')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>}
        {walk}
      </div>
      <p className={cn(sub, 'm-0 mt-1.5')}>{item.stop ? t('nextBusesHint') : t('noLive')}</p>
    </>
  )
}

/** Pharmacy on duty: the address, today's duty hours (the city's own text) and the area. Walk is the one primary button; Call is next to it. */
function PharmacyInfo({ item }: { item: RankedItem }) {
  const { t } = useT()
  return (
    <div className="mt-1" data-testid="duty-info">
      {item.addr && <div className={sub}>{item.addr}{item.sector ? ` · ${item.sector}` : ''}</div>}
      {item.duty && <div className="mt-0.5 font-semibold">{t('dutyToday')}: <span className="font-normal">{item.duty}</span></div>}
    </div>
  )
}
function PharmacyActions({ item, onWalk }: { item: RankedItem; onWalk: () => void }) {
  const { t } = useT()
  const tel = item.phone?.replace(/[^\d+]/g, '')
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
      {tel && <Button variant="secondary" render={<a href={`tel:${tel}`} />} nativeButton={false} data-testid="call">{t('call')} {item.phone}</Button>}
    </div>
  )
}

/** The live list could not be loaded (or is still loading): say so plainly, offer a retry and the city page. Never an old list. */
function LiveMessage({ state, onRetry }: { state: 'loading' | 'failed'; onRetry: () => void }) {
  const { t } = useT()
  if (state === 'loading') return <div className="px-4 py-5" role="status" data-testid="duty-loading"><p className={cn(sub, 'm-0')}>{t('dutyLoading')}</p></div>
  return (
    <section className="px-4 pb-3 pt-4" role="alert" data-testid="duty-failed">
      <h2 className={h2}>{t('dutyFail')}</h2>
      <p className={cn(sub, 'm-0 mt-1')}>{t('dutyFailBody')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onRetry} data-testid="duty-retry">{t('retry')}</Button>
        <Button variant="secondary" {...linkProps(DUTY_PAGE)} data-testid="duty-city">{t('cityPage')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
      </div>
    </section>
  )
}

/** A quiet stand-in for a list row while a live list loads: same structure and height as a real row, so nothing jumps when the real rows arrive. */
function PlaceholderRow() {
  return (
    <li className="border-b border-line" aria-hidden>
      <div className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2">
        <span className="min-w-0"><span className="block font-bold"><span className="inline-block h-[0.85em] w-44 max-w-full rounded-sm bg-surface align-middle" /></span><span className={cn(sub, 'block')}><span className="inline-block h-[0.8em] w-28 rounded-sm bg-surface align-middle" /></span></span>
        <span className="whitespace-nowrap text-right font-bold"><span className="inline-block h-[0.85em] w-9 rounded-sm bg-surface align-middle" /><span className={cn(sub, 'block font-normal')}><span className="inline-block h-[0.8em] w-7 rounded-sm bg-surface align-middle" /></span></span>
      </div>
    </li>
  )
}
const Placeholders = ({ n = 4 }: { n?: number }) => <ul className="m-0 list-none p-0" data-testid="placeholders">{Array.from({ length: n }, (_, i) => <PlaceholderRow key={i} />)}</ul>

/** Bizi: the two real jobs as chips (take a bike, return a bike, my own bike), and one line about the live counts. Always in view, above the nearest place. */
function BiziBar({ cat, setCat, bizi }: { cat: string; setCat: (c: string) => void; bizi: Pick<ReturnType<typeof useBizi>, 'state' | 'at' | 'retry'> }) {
  const { t } = useT()
  const options = LAYERS.bizi.cats!.map(c => ({ value: c, label: t(c as Key) }))
  return (
    <div className="px-4 pb-1 pt-3" data-testid="bizi-bar">
      <Chips value={cat} onChange={setCat} label={t('typeLabel')} options={options} allValue={LAYERS.bizi.catDefault} />
      {cat !== 'mine' && (
        <div className="mt-1 flex min-h-8 items-center justify-between gap-2" data-testid="bizi-status" data-state={bizi.state}>
          {bizi.state === 'live' && <p className={cn(sub, 'm-0')} role="status">{t('biziLive').replace('{time}', clockMadrid(bizi.at))}</p>}
          {bizi.state === 'loading' && <p className={cn(sub, 'm-0')} role="status"><span className="sr-only">{t('biziLoading')}</span><span aria-hidden className="inline-block h-[0.8em] w-40 rounded-sm bg-surface align-middle" /></p>}
          {bizi.state === 'failed' && (
            <>
              <p className={cn(sub, 'm-0 min-w-0')} role="alert"><span className="font-bold text-warn-ink">{t('biziFail')}</span></p>
              <Button variant="link" onClick={bizi.retry} data-testid="bizi-retry">{t('retry')}</Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const DIST_MIN = 'min'

// ---------- the block with the nearest (or selected) place ----------
export function NearestBlock({ layer, item, isSelected, hasPos, cat, onDetails, onWalk }: {
  layer: LayerConfig; item: RankedItem | null; isSelected: boolean; hasPos: boolean; cat: string
  onDetails: () => void; onWalk: () => void
}) {
  const { t, type } = useT()
  if (!item) return <div className="px-4 py-5"><p className={cn(sub, 'm-0')}>{t('noneOpen')}</p></div>
  const kind = isSelected ? t('selected') : t(('nearest' + layer.id + (layer.id === 'bizi' ? cat : '')) as Key)
  return (
    <m.section key={item.id} {...cardSwap} className="px-4 pb-3 pt-4" data-testid="nearest" aria-label={kind}>
      <div className={overline}>{kind}</div>
      <h2 className={cn(h2, 'mt-1')} data-testid="nearest-name">{item.name || type(item.type)}</h2>
      <div className="mt-1 font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></div>
      <div className="mt-0.5"><Status item={item} layer={layer} /></div>
      {item.type === 'bizi' && biziLine(t, item) && <div className="mt-0.5 font-semibold" data-testid="bizi-counts"><Tick>{biziLine(t, item, true)}</Tick></div>}
      {item.lines && <div className="mt-0.5 font-semibold" data-testid="bus-lines">{t('lines')}: {item.lines.replace(/,/g, ', ')}</div>}
      {item.type === 'pharmacy' && <PharmacyInfo item={item} />}
      {item.type === 'bus' ? <BusActions item={item} onWalk={onWalk} /> : item.type === 'pharmacy' ? <PharmacyActions item={item} onWalk={onWalk} /> : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
          <Button variant="secondary" onClick={onDetails} data-testid="details">{t('details')}</Button>
        </div>
      )}
    </m.section>
  )
}

// ---------- list ----------
function Row({ item, layer, selected, counting, onSelect }: { item: RankedItem; layer: LayerConfig; selected: boolean; counting: boolean; onSelect: () => void }) {
  const { t, type } = useT()
  const closed = layer.hours && item.open === false
  const rowLine = item.type === 'bizi' ? (biziLine(t, item) ? <Tick>{biziLine(t, item)}</Tick> : (counting ? <span aria-hidden className="inline-block h-[0.8em] w-32 rounded-sm bg-surface align-middle" /> : type(item.type))) : item.lines ? `${t('lines')} ${item.lines.replace(/,/g, ', ')}` : item.type === 'pharmacy' ? item.addr : item.name ? type(item.type) : item.note
  return (
    <li className={cn('relative scroll-mt-2 scroll-mb-2 border-b border-line', selected && 'bg-brand-tint')} data-id={item.id}>
      <BaseButton onClick={onSelect} className="grid min-h-14 w-full grid-cols-[1fr_auto] items-center gap-x-3 border-0 bg-transparent px-4 py-2 text-left text-ink [transition:scale_var(--dur-press)_var(--ease-out),background-color_var(--dur-press)] after:absolute after:inset-0 hov:bg-surface active:scale-[.97] motion-reduce:active:scale-100">
        <span className={cn('min-w-0', closed && 'opacity-60')}>
          <span className="block truncate font-bold">{item.name || type(item.type)}</span>
          <span className={cn(sub, 'block truncate')}>{rowLine}{dotBetween(rowLine, layer.hours)}{layer.hours && <Status item={item} layer={layer} />}</span>
        </span>
        <span className={cn('whitespace-nowrap text-right font-bold', closed && 'opacity-60')}>{fmtDist(item.d)}<span className={cn(sub, 'block font-normal')}>{walkMins(item.d)} {DIST_MIN}</span></span>
      </BaseButton>
      {item.type === 'lib' && <div className="pointer-events-none relative px-4 pb-1 [&_a]:pointer-events-auto [&_button]:pointer-events-auto"><Occupancy item={item} /></div>}
    </li>
  )
}

export function Controls({ layer, openOnly, setOpenOnly, showRange, setShowRange, cat, setCat }: {
  layer: LayerConfig; openOnly: boolean; setOpenOnly: (v: boolean) => void; showRange: boolean; setShowRange: (v: boolean) => void; cat: string; setCat: (c: string) => void
}) {
  const { t } = useT()
  if (!layer.hours && !layer.cats && layer.id !== 'pharmacy') return null
  return (
    <div className="px-4 pb-2">
      {layer.id === 'pharmacy' && <p className={cn(sub, 'm-0 py-1')}>{t('dutyNote')} ({madridDate()})</p>}
      {layer.hours && <Switch checked={openOnly} onCheckedChange={setOpenOnly} label={t('openNow')} hint={t('openNowHint')} testId="switch-open" />}
      {layer.id === 'wifi' && <Switch checked={showRange} onCheckedChange={setShowRange} label={t('showRange')} hint={t('showRangeHint')} testId="switch-range" />}
      {layer.cats && layer.id !== 'bizi' && <div className="mt-1"><Chips value={cat} onChange={setCat} label={t('typeLabel')} options={[{ value: 'all', label: t('all') }, ...layer.cats.map(c => ({ value: c, label: t(c as Key) }))]} /></div>}
      {layer.id === 'bizi' && <p className={cn(sub, 'm-0 py-1')}>{t('bizi')}</p>}
    </div>
  )
}

/** Above the list: how many places, and whose distances they are. Without a position: the plain truth and one big button; blocked: one calm line. */
function ListHeader({ count, hasPos, locating, denied, onLocate }: { count: number; hasPos: boolean; locating: boolean; denied: boolean; onLocate: () => void }) {
  const { t } = useT()
  return (
    <div className="border-y border-line bg-surface" data-testid="list-header">
      <div className={cn(overline, 'px-4 py-2')}>{count} {t('places')}{hasPos ? ` · ${t('distYou')}` : ''}</div>
      {!hasPos && (
        <div className="px-4 pb-3" data-testid="from-centre">
          <p className={cn(sub, 'm-0 font-semibold')}>{t('distCentre')}</p>
          {denied
            ? <p className={cn(sub, 'm-0 mt-1')} data-testid="loc-denied">{t('locDenied')}</p>
            : <Button onClick={onLocate} disabled={locating} className="mt-2 min-h-12 w-full" data-testid="locate"><Crosshair size="1.3em" aria-hidden />{locating ? t('locating') : t('useLocation')}</Button>}
        </div>
      )}
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
  layer: LayerConfig; liveState: 'loading' | 'failed' | null; onRetry: () => void; arr: RankedItem[]; allClosed: boolean; allOut: boolean; denied: boolean; bizi: ReturnType<typeof useBizi>; focus: RankedItem | null; selected: string | null; hasPos: boolean; locating: boolean
  openOnly: boolean; setOpenOnly: (v: boolean) => void; showRange: boolean; setShowRange: (v: boolean) => void; cat: string; setCat: (c: string) => void
  limit: number; onMoreRows: () => void; locked: boolean; onPick: (id: LayerId) => void; onGoal: (id: GoalId) => void; goalOrder: GoalId[]
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
      <GoalTabs layer={p.layer.id} order={p.goalOrder} onGoal={p.onGoal} />
      <ServiceChips layer={p.layer.id} order={p.goalOrder} onService={p.onPick} />
      <div className="shrink-0">
        {p.layer.id === 'bizi' && <BiziBar cat={p.cat} setCat={p.setCat} bizi={p.bizi} />}
        {p.liveState ? <LiveMessage state={p.liveState} onRetry={p.onRetry} /> : <NearestBlock layer={p.layer} item={p.focus} isSelected={!!p.selected} hasPos={p.hasPos} cat={p.cat} onDetails={p.onDetails} onWalk={p.onWalk} />}
        <Separator />
      </div>
      <Scroll locked={p.locked} viewportRef={p.viewportRef}>
        {!p.liveState && <Controls layer={p.layer} openOnly={p.openOnly} setOpenOnly={p.setOpenOnly} showRange={p.showRange} setShowRange={p.setShowRange} cat={p.cat} setCat={p.setCat} />}
        {p.allClosed && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-closed">{t('allClosed')}</p>}
        {p.allOut && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-out">{t(p.cat === 'return' ? 'biziNoDocks' : 'biziNoBikes')}</p>}
        {!p.liveState && <ListHeader count={p.arr.length} hasPos={p.hasPos} locating={p.locating} denied={p.denied} onLocate={p.onLocate} />}
        {p.liveState === 'loading' && <Placeholders />}
        <ul ref={listRef} className="m-0 list-none p-0" data-testid="list">
          {p.arr.slice(0, p.limit).map(it => <Row key={it.id} item={it} layer={p.layer} selected={it.id === (p.selected ?? p.focus?.id)} counting={p.bizi.state === 'loading'} onSelect={() => p.onSelect(it.id)} />)}
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
    <BaseButton onClick={onClick} data-testid={testId} className={cn('flex min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-transparent px-4 py-2 text-left text-ink [transition:scale_var(--dur-press)_var(--ease-out),background-color_var(--dur-press)] active:scale-[.97] motion-reduce:active:scale-100 hov:bg-surface', active && 'bg-brand-tint')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface text-ink">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span>{description && <span className={cn(sub, 'block')}>{description}</span>}</span>
      {status && <span className={sub}>{status}</span>}
      <CaretRight size="1.2em" className="shrink-0 text-ink-soft" aria-hidden />
    </BaseButton>
  )
}

export function SettingsPage({ lang, onClose, go, locked }: { lang: Lang; onClose: () => void; go: (p: 'language' | 'about') => void; locked: boolean }) {
  const { t } = useT()
  return (
    <>
      <ViewHeader title={t('settingsTitle')} onClose={onClose} />
      <Scroll locked={locked}>
        <PageRow testId="row-language" icon={<Translate size="1.4em" aria-hidden />} title={t('language')} status={lang === 'en' ? 'English' : 'Español'} onClick={() => go('language')} />
        <PageRow testId="row-about" icon={<InfoIcon size="1.4em" aria-hidden />} title={t('about')} onClick={() => go('about')} />
      </Scroll>
    </>
  )
}

export function LanguagePage({ lang, setLang, onBack, onClose, locked }: { lang: Lang; setLang: (l: Lang) => void; onBack?: () => void; onClose: () => void; locked: boolean }) {
  const { t } = useT()
  return (
    <>
      <ViewHeader title={t('langTitle')} onBack={onBack} onClose={onClose} />
      <Scroll locked={locked}>
        <RadioGroup value={lang} onValueChange={v => setLang(v as Lang)} aria-label={t('langTitle')}>
          {(['en', 'es'] as Lang[]).map(l => (
            <Radio.Root key={l} value={l} data-testid={`lang-${l}`} className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left font-bold text-ink [transition:scale_var(--dur-press)_var(--ease-out),background-color_var(--dur-press)] active:scale-[.97] motion-reduce:active:scale-100 hov:bg-surface">
              <span className="flex-1">{l === 'en' ? t('langEn') : t('langEs')}</span>
              <Radio.Indicator className="text-brand-text"><Check size="1.3em" weight="bold" aria-hidden /></Radio.Indicator>
            </Radio.Root>
          ))}
        </RadioGroup>
      </Scroll>
    </>
  )
}

export function AboutPage({ onBack, onClose, locked }: { onBack?: () => void; onClose: () => void; locked: boolean }) {
  const { t } = useT()
  const d = dataRefreshed()
  return (
    <>
      <ViewHeader title={t('aboutTitle')} onBack={onBack} onClose={onClose} />
      <Scroll locked={locked}>
        <div className="flex flex-col gap-3 px-4 pb-8 pt-2 leading-relaxed">
          <h2 className="font-title text-[1.1em] font-semibold text-brand-text" data-testid="app-name">{t('title')} · {t('subtitle')}</h2>
          <p className="m-0 font-bold">{t('disclaimer')}</p>
          <p className="m-0">{t('privacy')}</p>
          <p className="m-0">{t('noGuarantee')}</p>
          <h2 className="font-title text-[1.1em] font-semibold text-ink">{t('sources')}</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>{t('creditsCity')}</li><li>{t('creditsFountains')}</li><li>{t('creditsOsm')}</li><li>{t('creditsShelters')} ({DATA.shelters.updated})</li><li>{t('creditsBus')} ({DATA.bus.updated})</li><li>{t('creditsPharmacy')}</li><li>{t('creditsBizi')}</li><li>{t('creditsTgo')}</li><li>{t('creditsTiles')}</li>
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
