import { Button as BaseButton } from '@base-ui/react/button'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { ArrowUpRight, ArrowsLeftRight, CaretLeft, CaretRight, Check, X as CloseIcon, Crosshair, Translate, Info as InfoIcon, Thermometer } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { DATA, dataRefreshed } from '../data'
import { track } from '../lib/analytics'
import { fmtDist, walkMins, walkUrl } from '../lib/geo'
import { chipSplit, nextDepartures, type BusRoutes } from '../lib/transit'
import { nowMadrid } from '../lib/hours'
import type { CercaniasTimes } from '../data/lazy'
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
import { BUZ_URL, RENFE_URL, TRAM_URL, biziLine, busUrl, clockMadrid, fmtHours, reportUrl, srcExplain, srcLabel } from './labels'
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
    return <a href={BUZ_URL} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center gap-1 font-bold text-brand-text underline-offset-2 hov:underline">{t('occLive')} <ArrowUpRight size="1em" weight="bold" aria-hidden /></a>
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

/** Tram stop: the line and its two ends, then ONE primary button to the tram company's times page (a browser cannot read them), then Walk. */
function TramActions({ item, onWalk }: { item: RankedItem; onWalk: () => void }) {
  const { t } = useT()
  const [a, b] = DATA.tram.ends
  return (
    <>
      <p className="m-0 mt-2 text-[0.93em] leading-snug" data-testid="tram-info"><span className="mr-1.5 rounded-[0.3em] bg-[var(--color-tram)] px-1.5 py-0.5 font-bold text-on-brand">T1</span>{t('tramDirs').replace('{a}', a).replace('{b}', b)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button {...linkProps(TRAM_URL)} onClick={() => track('times', 'tram')} data-testid="tram-times">{t('tramTimes')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
        <Button variant="secondary" {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
      </div>
      <p className={cn(sub, 'm-0 mt-1.5')}>{t('tramHint')}</p>
    </>
  )
}

/** Cercanías station: the next 3 trains from the baked timetable, plainly labelled as planned (not real time), with the date of the data. Renfe link-out for delays. */
function TrainActions({ item, times, onWalk }: { item: RankedItem; times: CercaniasTimes | null; onWalk: () => void }) {
  const { t } = useT()
  const [tick, setTick] = useState(0)
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(i) }, [])
  const tt = times && item.code ? times.t[item.code] : undefined
  void tick
  const next = tt ? nextDepartures(tt, nowMadrid(), 3) : []
  const [y, mo, d] = DATA.cercanias.updated?.split('-') ?? []
  return (
    <>
      <div className="mt-2" data-testid="train-next">
        <div className={overline}>{t('trainNext')}</div>
        {!times ? <p className={cn(sub, 'm-0')}>{t('trainLoading')}</p> : next.length === 0 ? <p className={cn(sub, 'm-0')}>{t('trainNone')}</p> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {next.map((n, i) => (
              <li key={i} className="flex items-baseline gap-2 leading-snug" data-testid="train-row">
                <span className="font-bold tabular-nums">{n.at}</span>
                <span className="min-w-0 flex-1 truncate">{t('trainTo').replace('{to}', DATA.cercanias.dests[n.dest] ?? '')}</span>
                <span className="text-ink-soft">{n.tomorrow ? t('trainTomorrow') : t('trainIn').replace('{n}', String(n.inMin))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={cn(sub, 'm-0 mt-0.5')} data-testid="train-planned">{t('trainPlanned')}{d ? ` · ${t('trainUpdated').replace('{date}', `${d}/${mo}/${y}`)}` : ''}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button {...linkProps(RENFE_URL)} onClick={() => track('times', 'cercanias')} data-testid="train-times">{t('trainTimes')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
        <Button variant="secondary" {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
      </div>
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

/** What the line mode needs to show: the line, the direction on show, the stops in order and the place of the current one in them (-1 = none). */
export interface LineView { line: string; dir: number; dirs: number; to?: string; stops: { post: string; name: string }[]; idx: number; stop?: string }

const LINE_ROWS = 2, LINE_COLS = 6 // the lines on a stop card: at most two rows of six, then a "+N" chip that opens the rest
/** The lines a stop serves, as chips. A line with a known route is a button (draws it); the others are plain. */
function LineChips({ lines, routes, onLine }: { lines: string; routes: BusRoutes | null; onLine: (line: string) => void }) {
  const { t } = useT()
  const [all, setAll] = useState(false)
  const list = lines.split(',')
  const { shown, more } = all ? { shown: list, more: 0 } : chipSplit(list, LINE_ROWS * LINE_COLS)
  const chip = 'flex min-h-[44px] min-w-0 items-center justify-center rounded-btn px-1 text-[0.93em] font-bold'
  return (
    <div className="mt-1" data-testid="bus-lines">
      <span className="font-semibold">{t('lines')}</span>
      <ul className="m-0 mt-1 grid list-none grid-cols-6 gap-2 p-0">
        {shown.map(l => (
          <li key={l} className="min-w-0">
            {routes?.lines[l]
              ? <BaseButton onClick={() => onLine(l)} render={<m.button {...tap} />} aria-label={t('lineChip').replace('{n}', l)} data-testid="bus-line-chip" data-line={l} className={cn(chip, 'w-full border-0 bg-bus text-on-brand')}>{l}</BaseButton>
              : <span className={cn(chip, 'bg-surface text-ink-soft')} data-testid="bus-line-plain">{l}</span>}
          </li>
        ))}
        {more > 0 && <li className="min-w-0"><BaseButton onClick={() => setAll(true)} render={<m.button {...tap} />} data-testid="bus-line-more" className={cn(chip, 'w-full border border-line-strong bg-transparent text-brand-text')}>{t('lineMore').replace('{n}', String(more))}</BaseButton></li>}
        {all && list.length > LINE_ROWS * LINE_COLS && <li className="col-span-2 min-w-0"><BaseButton onClick={() => setAll(false)} render={<m.button {...tap} />} className={cn(chip, 'w-full border-0 bg-transparent text-brand-text')}>{t('lineLess')}</BaseButton></li>}
      </ul>
    </div>
  )
}

/** A bus line chosen: "Line 38 · toward X", a way to flip direction, the stops still to come in order, and the link to the next buses. */
export function LineBlock({ view, onBack, onDir }: { view: LineView; onBack: () => void; onDir: () => void }) {
  const { t } = useT()
  const title = [t('busLine').replace('{n}', view.line), view.to && t('toward').replace('{to}', view.to)].filter(Boolean).join(' · ')
  const from = Math.max(0, view.idx), upcoming = view.stops.slice(from, from + 4), left = view.stops.length - (from + upcoming.length)
  return (
    <m.section key={view.line + view.dir} {...cardSwap} className="px-4 pb-3 pt-4" data-testid="line-block" aria-label={title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className={overline}>{t('routeOf')}</div>
          <h2 className={cn(h2, 'mt-1')} data-testid="line-title">{title}</h2>
        </div>
        <BaseButton onClick={onBack} aria-label={t('lineBack')} title={t('lineBack')} data-testid="line-back" render={<m.button {...tap} />} className="-mr-2 -mt-2 inline-flex size-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-brand-text">
          <CloseIcon size="1.4em" weight="bold" aria-hidden />
        </BaseButton>
      </div>
      <ol className="m-0 mt-2 list-none p-0" aria-label={t('stepsLabel')} data-testid="line-steps">
        {upcoming.map((s, i) => {
          const here = view.idx >= 0 && i === 0
          return (
            <li key={s.post + i} className={cn('flex items-center gap-2 py-0.5 text-[0.93em]', here ? 'font-bold text-brand-text' : 'text-ink')} data-here={here ? '' : undefined}>
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full border-2 border-brand', here ? 'bg-brand' : 'bg-paper')} />
              <span className="min-w-0 truncate">{s.name}</span>
              {here && <span className="shrink-0 text-[0.87em] font-semibold text-ink-soft">{t('stepHere')}</span>}
            </li>
          )
        })}
        {left > 0 && <li className={cn(sub, 'py-0.5 pl-[1.15rem]')}>{t('stepMore').replace('{n}', String(left))}</li>}
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        {view.stop && <Button {...linkProps(busUrl(view.stop))} onClick={() => track('times', 'bus')} data-testid="next-buses">{t('nextBuses')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>}
        {view.dirs > 1 && <Button variant="secondary" onClick={onDir} data-testid="line-dir"><ArrowsLeftRight size="1.2em" aria-hidden />{t('otherDir')}</Button>}
      </div>
    </m.section>
  )
}

// ---------- the block with the nearest (or selected) place ----------
export function NearestBlock({ layer, item, isSelected, hasPos, cat, routes, times, onLine, onDetails, onWalk }: {
  layer: LayerConfig; item: RankedItem | null; isSelected: boolean; hasPos: boolean; cat: string
  routes: BusRoutes | null; times: CercaniasTimes | null; onLine: (line: string) => void
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
      {item.type === 'lib' && <div className="mt-0.5"><Occupancy item={item} /></div>}
      {item.type === 'bizi' && biziLine(t, item) && <div className="mt-0.5 font-semibold" data-testid="bizi-counts"><Tick>{biziLine(t, item, true)}</Tick></div>}
      {item.lines && <LineChips lines={item.lines} routes={item.stop ? routes : null} onLine={onLine} />}
      {item.type === 'pharmacy' && <PharmacyInfo item={item} />}
      {item.type === 'bus' ? <BusActions item={item} onWalk={onWalk} /> : item.type === 'tram' ? <TramActions item={item} onWalk={onWalk} /> : item.type === 'train' ? <TrainActions item={item} times={times} onWalk={onWalk} /> : item.type === 'pharmacy' ? <PharmacyActions item={item} onWalk={onWalk} /> : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
          <Button variant="secondary" onClick={onDetails} data-testid="details">{t('details')}</Button>
        </div>
      )}
    </m.section>
  )
}

// ---------- the next two nearest, under the card ----------
/** The two nearest places after the one on the card, as compact chips: one tap shows that place (card and map). */
export function Nearby({ items, onSelect }: { items: RankedItem[]; onSelect: (id: string) => void }) {
  const { t, type } = useT()
  if (!items.length) return null
  return (
    <div className="px-4 pb-3" data-testid="nearby">
      <div className={overline}>{t('alsoNearby')}</div>
      <ul className="m-0 mt-1 grid list-none grid-cols-2 gap-2 p-0">
        {items.map(it => (
          <li key={it.id} className="min-w-0">
            <BaseButton onClick={() => onSelect(it.id)} render={<m.button {...tap} />} data-testid="nearby-item" className={cn('flex min-h-[44px] w-full items-center justify-between gap-2 rounded-btn border-0 bg-surface px-3 text-left text-ink', it.open === false && 'opacity-60')}>
              <span className="min-w-0 truncate text-[0.93em] font-semibold">{it.name || type(it.type)}</span>
              <span className="shrink-0 text-[0.87em] font-bold text-ink-soft">{fmtDist(it.d)}</span>
            </BaseButton>
          </li>
        ))}
      </ul>
    </div>
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

/** Whose distances these are. Without a position: the plain truth and one big button; blocked: one calm line. With a position: nothing (the card says "from you"). */
function Locate({ hasPos, locating, denied, onLocate }: { hasPos: boolean; locating: boolean; denied: boolean; onLocate: () => void }) {
  const { t } = useT()
  if (hasPos) return null
  return (
    <div className="px-4 pb-3" data-testid="from-centre">
      <p className={cn(sub, 'm-0 font-semibold')}>{t('distCentre')}</p>
      {denied
        ? <p className={cn(sub, 'm-0 mt-1')} data-testid="loc-denied">{t('locDenied')}</p>
        : <Button onClick={onLocate} disabled={locating} className="mt-2 min-h-12 w-full" data-testid="locate"><Crosshair size="1.3em" aria-hidden />{locating ? t('locating') : t('useLocation')}</Button>}
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
  nearby: RankedItem[]; peekRef: React.Ref<HTMLDivElement>
  routes: BusRoutes | null; times: CercaniasTimes | null; onLine: (line: string) => void; lineView: LineView | null; onLineBack: () => void; onLineDir: () => void
  openOnly: boolean; setOpenOnly: (v: boolean) => void; showRange: boolean; setShowRange: (v: boolean) => void; cat: string; setCat: (c: string) => void
  locked: boolean; onPick: (id: LayerId) => void; onGoal: (id: GoalId) => void; goalOrder: GoalId[]
  onSelect: (id: string) => void; onLocate: () => void; onDetails: () => void; onWalk: () => void; onAbout: () => void
  viewportRef?: React.Ref<HTMLDivElement>; desktop: boolean
}) {
  const { t } = useT()
  return (
    <>
      <GoalTabs layer={p.layer.id} order={p.goalOrder} onGoal={p.onGoal} />
      <ServiceChips layer={p.layer.id} order={p.goalOrder} onService={p.onPick} />
      {/* everything down to the end of this block is what the sheet shows at peek: the card and the two places after it */}
      <div className="shrink-0" ref={p.peekRef} data-testid="peek-block">
        {p.layer.id === 'bizi' && <BiziBar cat={p.cat} setCat={p.setCat} bizi={p.bizi} />}
        {p.lineView ? <LineBlock view={p.lineView} onBack={p.onLineBack} onDir={p.onLineDir} />
          : p.liveState ? <LiveMessage state={p.liveState} onRetry={p.onRetry} /> : <NearestBlock layer={p.layer} item={p.focus} isSelected={!!p.selected} hasPos={p.hasPos} cat={p.cat} routes={p.routes} times={p.times} onLine={p.onLine} onDetails={p.onDetails} onWalk={p.onWalk} />}
        {!p.lineView && p.allClosed && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-closed">{t('allClosed')}</p>}
        {p.allOut && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-out">{t(p.cat === 'return' ? 'biziNoDocks' : 'biziNoBikes')}</p>}
        {!p.liveState && !p.lineView && <Nearby items={p.nearby} onSelect={p.onSelect} />}
        <Separator />
      </div>
      <Scroll locked={p.locked} viewportRef={p.viewportRef}>
        {!p.liveState && <Controls layer={p.layer} openOnly={p.openOnly} setOpenOnly={p.setOpenOnly} showRange={p.showRange} setShowRange={p.setShowRange} cat={p.cat} setCat={p.setCat} />}
        {!p.liveState && <Locate hasPos={p.hasPos} locating={p.locating} denied={p.denied} onLocate={p.onLocate} />}
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
            <li>{t('creditsCity')}</li><li>{t('creditsFountains')}</li><li>{t('creditsOsm')}</li><li>{t('creditsShelters')} ({DATA.shelters.updated})</li><li>{t('creditsBus')} ({DATA.bus.updated})</li><li>{t('creditsTram')} ({DATA.tram.updated})</li><li>{t('creditsTrain')} ({DATA.cercanias.updated})</li><li>{t('creditsPharmacy')}</li><li>{t('creditsBizi')}</li><li>{t('creditsTgo')}</li><li>{t('creditsTiles')}</li>
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
