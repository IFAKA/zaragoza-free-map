import { Button as BaseButton } from '@base-ui/react/button'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { ChatCircleText, ArrowUpRight, ArrowsLeftRight, CaretLeft, CaretRight, Check, X as CloseIcon, Crosshair, DownloadSimple, Translate, Info as InfoIcon, Heart, Thermometer, GithubLogo } from '@phosphor-icons/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Skel, SkelRows } from './Skel'
import { DATA, dataRefreshed } from '../data'
import { fmtDist, walkMins, walkUrl } from '../lib/geo'
import { installEnv, installWay, promptInstall } from '../lib/install'
import { loadRailAlerts, type RailAlert } from '../lib/alerts'
import detours from '../data/detours.json'
import routecheck from '../data/routecheck.json'
import { nextDepartures, type BusRoutes } from '../lib/transit'
import { nowMadrid } from '../lib/hours'
import type { CercaniasTimes } from '../data/lazy'
import type { Key, Lang } from '../lib/i18n'
import type { LatLon, LayerConfig, LayerId, RankedItem } from '../lib/types'
import { ServiceGroups, ServiceHeader } from './ServiceBar'
import { Tick } from './Tick'
import { cardSwap, tap } from './motion'
import { m } from 'motion/react'
import { rangeMetres } from '../lib/geo'
import { DUTY_PAGE, madridDate } from '../lib/duty'
import { BUZ_URL, biziLine, clockMadrid, fmtHours, srcExplain, srcLabel } from './labels'
import type { useBizi } from './useBizi'
import { useT } from './lang'
import { busAlternatives, ensureBakedBad, loadBus, loadTram, routeAlternatives, towardEnd, type Arrival } from '../lib/live'
import { chooseDir, outsideCentre, railGroups, shownDir, towardCentre, type DirOpt } from '../lib/direction'
import { lsGet, lsSet } from '../lib/cache'
import { decodePolyline } from '../lib/transit'
import { DirRows } from './DirRows'
import { tramDir } from '../lib/tramdir'
import { useLive } from './useLive'
import { usePublishVehicles } from './vehicles'
import { between, bearingTo, nextTwo, stitch, TRAIN_KMH, TRAIN_MAX_MIN, TRAM_KMH, upstream, type Vehicle } from '../lib/vehicles'
import { Button, InfoPop, Scroll, Separator, linkProps } from './ui/kit'
import { cn } from './cn'
import { splitFav, useFavs } from '../lib/favs'
import { FavButton } from './Favs'
import { OpenDot } from './OpenDot'

const h2 = 'font-title text-[1.4em] font-semibold leading-tight text-brand-text'
const overline = 'text-[0.8em] font-semibold uppercase tracking-wide text-ink-soft'
const sub = 'text-[0.93em] leading-snug text-ink-soft'

// ---------- shared small pieces ----------
/** The top of the scroll area (full height): what a card moves out of the peek (line chips, the position note, the links). HomePage sets it. */
export const MoreCtx = createContext<HTMLElement | null>(null)
function More({ children }: { children: ReactNode }) {
  const el = useContext(MoreCtx)
  return el ? createPortal(children, el) : null
}
/** Every button of a place card in ONE row that scrolls sideways: The way there first, then Save, then the rest the place has (times, call). */
function Actions({ item, onWalk, fav, extra }: { item: RankedItem; onWalk: () => void; fav: ReactNode; extra?: ReactNode }) {
  const { t } = useT()
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:whitespace-nowrap" data-testid="actions">
      <Button {...linkProps(walkUrl(item.lat, item.lon))} onClick={onWalk} data-testid="walk">{t('walk')} <ArrowUpRight size="1.1em" weight="bold" aria-hidden /></Button>
      {fav}
      {extra}
    </div>
  )
}

/** The cross at the end of a page header that has no back arrow (a mode to leave: edit, delete, rename). */
export function CloseButton({ onClick, label, testId }: { onClick: () => void; label: string; testId?: string }) {
  return (
    <m.button {...tap} type="button" onClick={onClick} aria-label={label} title={label} data-testid={testId}
      className="ml-auto mr-1 inline-flex size-11 select-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-brand-text"><CloseIcon size="1.4em" weight="bold" aria-hidden /></m.button>
  )
}

export function PageHeader({ title, onBack, action, noBack }: { title: string; onBack: () => void; action?: ReactNode; noBack?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-0">
      {noBack ? <span className="w-2 shrink-0" aria-hidden /> : (
        <BaseButton onClick={onBack} aria-label={t('back')} data-testid="back" render={<m.button {...tap} />} className="inline-flex size-[44px] items-center justify-center rounded-full border-0 bg-transparent text-brand-text">
          <CaretLeft size="1.4em" weight="bold" aria-hidden />
        </BaseButton>
      )}
      <h1 className={h2}>{title}</h1>
      {action}
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
  if (item.always) return <OpenDot open>{t('alwaysOn')}</OpenDot>
  if (item.open === true) return <OpenDot open>{t('openShort')}</OpenDot>
  if (item.open === false) return <OpenDot open={false}>{t('closedShort')}</OpenDot>
  return null // no known hours: say nothing rather than "unknown"
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

/** The last direction chosen at a stop, kept on this device only. */
const lastDir = (key: string): string | null => lsGet('dir:' + key)

/**
 * Which of two directions is on show. The person's tap wins; before any tap the default is worked out once, when the data first arrives
 * (remembered choice, else soonest, else the way to the centre) and then stays, so the chips never jump under a thumb when the times refresh.
 */
function useDirChoice(memo: string, opts: DirOpt[], centre: string | null) {
  const [chosen, setChosen] = useState<string | null>(null)
  const ready = opts.some(o => o.soon !== null)
  const def = opts.length ? chooseDir(opts, lastDir(memo), centre) : ''
  useEffect(() => { if (chosen === null && ready) setChosen(def) }, [chosen, ready, def])
  const pickDir = (id: string) => { setChosen(id); lsSet('dir:' + memo, id) }
  return { dir: opts.length ? shownDir(opts, chosen ?? def) : '', pickDir }
}

/** The tram's two ends as points, north first: the baked stops with the highest and the lowest latitude (the line runs north-south). */
const tramEnds = (): { id: 'n' | 's'; at: LatLon }[] => {
  const rows = DATA.tram.rows
  const n = rows.reduce((a, r) => (r[2] > a[2] ? r : a)), s = rows.reduce((a, r) => (r[2] < a[2] ? r : a))
  return [{ id: 'n', at: [n[2], n[3]] }, { id: 's', at: [s[2], s[3]] }]
}

// the tracks as one ordered line each (built once): the tram's ~60 pieces joined south to north, the Cercanías line west to east
let tramPath: LatLon[] | null = null, railPath: LatLon[] | null = null
const tramLine = () => (tramPath ??= stitch(DATA.tram.line.map(decodePolyline)))
const railLine = () => (railPath ??= decodePolyline(DATA.cercanias.line[0]))
const vehicleOf = (pos: LatLon, i: number, icon: Vehicle['icon'], stop: LatLon, fit: string): Vehicle => ({ id: 'veh' + i, pos, icon, stop, fit, bearing: bearingTo(pos, stop), color: icon === 'tram' ? 'var(--color-tram)' : 'var(--color-train)' })
/** The start of a direction (where its vehicles set off): the first point of `path` when they travel towards its end, else the last. */
const startOf = (path: LatLon[], forward: boolean, stop: LatLon, fit: string, icon: Vehicle['icon'] = 'tram'): Vehicle => {
  const pos = forward ? path[0] : path[path.length - 1]
  return { id: 'veh0', pos, icon, stop, fit, bearing: bearingTo(pos, stop), start: true, via: between(path, pos, stop), color: icon === 'tram' ? 'var(--color-tram)' : 'var(--color-train)' }
}
/** The map markers are estimates: one short note, in the full-height area. */
function VehNote({ show }: { show: boolean }) {
  const { t } = useT()
  return show ? <More><p className={cn(sub, 'm-0 px-4 pb-2 text-[0.8em] leading-tight')} data-testid="veh-note">{t('vehNote')}</p></More> : null
}

/**
 * Next arrivals for a bus or tram stop, read live from the city (30 s refresh while visible). The box keeps its height while loading; if the city does not answer it is not shown at all, and the link below still works.
 * A tram stop shows two direction chips and only the chosen direction's next trams. `pick` narrows a bus stop's rows (the route view: this line, towards its end).
 */
function LiveTimes({ kind, stopKey, load, stopName, title, pick, at, origin, line, onLine, lineOk }: {
  kind: 'bus' | 'tram'; stopKey: string; load: (signal: AbortSignal) => ReturnType<typeof loadBus>; stopName?: string
  title?: string; pick?: (a: Arrival[]) => Arrival[]; at?: LatLon; origin?: LatLon; line?: string
  /** Bus stop: tapping a row opens that line. */ onLine?: (line: string) => void; lineOk?: (line: string) => boolean
}) {
  const { t } = useT()
  const { live, state } = useLive(stopKey, load)
  const all = live ? (pick ? pick(live.arrivals) : live.arrivals) : []
  // tram: split the rows by direction (from the destination's place on the line)
  const tram = kind === 'tram' && stopName ? all.map(r => ({ r, dir: tramDir(r.dest, stopName, DATA.tram.rows) })) : null
  const hasDirs = !!tram && tram.some(x => x.dir)
  // the two directions are shown for every tram stop, even when the city sends no times (the direction is about the track, not the data)
  const dirsOn = kind === 'tram' && !!at && (hasDirs || all.length === 0)
  const opts: DirOpt[] = dirsOn ? (['n', 's'] as const).map(id => ({ id, soon: (tram ?? []).filter(x => x.dir === id).reduce<number | null>((m0, x) => (m0 === null ? x.r.mins[0] : Math.min(m0, x.r.mins[0])), null) })) : []
  const centre = dirsOn && at && outsideCentre(origin ?? at) ? towardCentre(at, tramEnds()) : null
  const { dir, pickDir } = useDirChoice('tram:' + stopKey, opts, centre)
  // tram: the next 2 trams of the shown direction, placed on the track upstream of the stop (approximate; none without live minutes)
  const tramVeh: Vehicle[] = kind === 'tram' && state === 'live' && tram && dirsOn && at
    ? upstream(tramLine(), at, dir === 'n', nextTwo(tram.filter(x => x.dir === dir).flatMap(x => x.r.mins)), TRAM_KMH).map((p, i) => ({ ...vehicleOf(p, i, 'tram', at, stopKey + dir), via: between(tramLine(), p, at) })) : []
  const tramLn = tramLine()
  const tramShown: Vehicle[] = tramVeh.length || !(dirsOn && at && tramLn.length) ? tramVeh : [startOf(tramLn, dir === 'n', at, stopKey + dir)] // no tram to place: show where this direction starts
  usePublishVehicles(tramShown)
  const [north, south] = DATA.tram.ends
  const min = (n: number) => (n === 0 ? t('liveNow') : t('liveMin').replace('{n}', String(n)))
  const dirTimes = (id: 'n' | 's') => (tram ?? []).filter(x => x.dir === id).flatMap(x => x.r.mins).sort((x, y) => x - y).slice(0, 2)
  const tramLineName = tram?.[0]?.r.line ?? 'L1'
  const picker = dirsOn && <DirRows testId="tram-dirs" label={t('dirsLabel')} value={dir} onPick={pickDir} chips={(['n', 's'] as const).map(id => {
    const ms = dirTimes(id)
    return { id, label: id === 'n' ? north : south, badge: <span className="min-w-[2.6em] rounded-[0.3em] bg-[var(--color-tram)] px-1.5 py-0.5 text-center text-[0.93em] font-bold text-on-brand">{tramLineName}</span>, times: ms.length ? ms.map(min).join(' · ') : '—' }
  })} />
  if (state === 'failed' && !live) return <div data-testid="live-times" data-state={state}>{picker}<p className={cn(sub, 'm-0 mt-1')}>{t('noLive')}</p></div>
  const rows = (hasDirs ? [] : all).slice(0, 3)
  const first = rows[0]
  const rowCls = 'flex items-center gap-2'
  const rowBody = (r: Arrival, i: number) => (
    <>
      <span className={cn('min-w-[2.6em] rounded-[0.3em] px-1.5 py-0.5 text-center text-[0.93em] font-bold text-on-brand', kind === 'bus' ? 'bg-bus' : 'bg-[var(--color-tram)]')}>{r.line}</span>
      <span className="min-w-0 flex-1 leading-tight"><span className="block truncate">{r.dest}</span></span>
      {i === 0
        ? <span className="shrink-0 tabular-nums" data-testid="live-first"><span className="font-extrabold">{min(r.mins[0])}</span>{r.mins.length > 1 && <span className="font-bold text-ink-soft"> · {r.mins.slice(1).map(min).join(' · ')}</span>}</span>
        : <span className="shrink-0 font-bold tabular-nums">{r.mins.map(min).join(' · ')}</span>}
    </>
  )
  const viaText = live?.via ? t('nextBusesNear').replace('{name}', live.via.name).replace('{d}', fmtDist(live.via.d)) : ''
  return (
    <div className="mt-1 min-h-[3.5rem]" data-testid="live-times" data-state={state}>
      {title && <div className={overline}>{title}</div>}
      {!live ? <div className="mt-1" role="status"><span className="sr-only">{t('liveLoading')}</span><SkelRows /></div> : (
        <>
          {live.via && (live.via.side ? (
            <div className="m-0 mt-1 leading-snug" data-testid="live-via" data-side={live.via.side}>
              <p className="m-0 font-semibold">{t('routeVia').replace('{n}', line ?? '').replace('{name}', live.via.name)}</p>
              <p className={cn(sub, 'm-0')}>{t('routeNoCity')} {live.via.side === 'before' ? t('routeBefore') : t('routeAfter')}</p>
            </div>
          ) : <p className="m-0 mt-1 truncate font-semibold" data-testid="live-via" title={viaText} aria-label={viaText}>{viaText}</p>)}
          {live.notice && <p className="m-0 mt-1 rounded-btn bg-surface px-2 py-1 text-[0.87em] font-semibold leading-snug" data-testid="live-notice">{live.notice}</p>}
          {dirsOn ? picker : !first ? <p className={cn(sub, 'm-0 mt-1')}>{t('liveNone')}</p> : (
            <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-line p-0">
              {rows.map((r, i) => (
                <li key={r.line + r.dest} className="py-1.5 first:pt-0 last:pb-0" data-testid="live-row">
                  {onLine && lineOk?.(r.line) ? <BaseButton onClick={() => onLine(r.line)} render={<m.button {...tap} />} data-testid="live-row-open" data-line={r.line} aria-label={t('lineChip').replace('{n}', r.line)} className={cn(rowCls, 'w-full min-h-9 border-0 bg-transparent p-0 text-left text-inherit')}>{rowBody(r, i)}<CaretRight size="1em" weight="bold" className="shrink-0 text-ink-soft" aria-hidden /></BaseButton> : <div className={cn(rowCls, 'min-h-9')}>{rowBody(r, i)}{onLine && <span className="w-[1em] shrink-0" aria-hidden />}</div>}
                </li>
              ))}
            </ul>
          )}
          <More><div className="flex items-center gap-2 px-4 pb-1">
            <div className={cn(sub, 'flex min-w-0 items-center gap-1 text-[0.8em]')} data-testid="live-updated">{state === 'live' && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}<span className="truncate">{t('liveUpdated').replace('{t}', clockMadrid(live.at))}</span></div>
          </div></More>
          <VehNote show={tramVeh.length > 0} />
        </>
      )}
    </div>
  )
}

/** Bus stop: live next buses (city stops only).  */
function BusActions({ item, origin, onWalk, fav, onLine, lineOk }: { item: RankedItem; origin: LatLon; onWalk: () => void; fav: ReactNode; onLine?: (line: string) => void; lineOk?: (line: string) => boolean }) {
  const { t } = useT()
  const stop = item.stop
  const live = !!stop && /^\d+$/.test(stop)
  // the neighbours are picked after the list of always-failing stops is loaded, so the nearest ones that can answer are chosen (see lib/busbad.ts)
  const load = useCallback(async (s: AbortSignal) => {
    await ensureBakedBad()
    return loadBus(stop ?? '', s, undefined, undefined, stop && item.lines ? busAlternatives(stop, item.lines, [item.lat, item.lon], origin, DATA.bus.rows) : [])
  }, [stop, item.lines, item.lat, item.lon, origin])
  return (
    <>
      {live && <LiveTimes key={stop} kind="bus" stopKey={stop} load={load} onLine={onLine} lineOk={lineOk} />}
      {!live && !stop && <p className={cn(sub, 'm-0 mt-1')}>{t('noLive')}</p>}
      <Actions item={item} onWalk={onWalk} fav={fav} />
    </>
  )
}

/** Tram stop: live next trams (both platforms).  */
function TramActions({ item, origin, onWalk, fav }: { item: RankedItem; origin: LatLon; onWalk: () => void; fav: ReactNode }) {
  const ids = item.tramIds ?? []
  const key = ids.join(',')
  const load = useCallback((s: AbortSignal) => loadTram(key ? key.split(',') : [], s), [key])
  return (
    <>
      {key && <LiveTimes key={key} kind="tram" stopKey={key} load={load} stopName={item.name} at={[item.lat, item.lon]} origin={origin} />}
      <Actions item={item} onWalk={onWalk} fav={fav} />
    </>
  )
}

/** Cercanías station: the next 3 trains from the baked timetable, plainly labelled as planned (not real time), with the date of the data. */
function TrainActions({ item, origin, times, onWalk, fav }: { item: RankedItem; origin: LatLon; times: CercaniasTimes | null; onWalk: () => void; fav: ReactNode }) {
  const { t } = useT()
  const [tick, setTick] = useState(0)
  useEffect(() => { const i = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(i) }, [])
  const tt = times && item.code ? times.t[item.code] : undefined
  void tick
  const here: LatLon = [item.lat, item.lon]
  // the two travel directions at this station, from the destinations its timetable really has
  const groups = useMemo(() => {
    if (!tt) return []
    const used = new Set<number>()
    for (const day of Object.values(tt)) for (let i = 1; i < day.length; i += 2) used.add(day[i])
    const dests = [...used].flatMap(i => { const r = DATA.cercanias.rows.find(x => x[1] === DATA.cercanias.dests[i]); return r ? [{ i, at: [r[2], r[3]] as LatLon }] : [] })
    return railGroups(decodePolyline(DATA.cercanias.line[0]), here, dests)
  }, [tt, item.lat, item.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = nowMadrid()
  const per = groups.map(g => { const deps = tt ? nextDepartures(tt, now, 3, d => g.dests.includes(d)) : []; return { g, deps, soon: deps.length && !deps[0].tomorrow ? deps[0].inMin : null } })
  const two = per.length === 2
  const opts: DirOpt[] = per.map(x => ({ id: x.g.id, soon: x.soon }))
  const ends = per.flatMap(x => { const r = DATA.cercanias.rows.find(y => y[1] === DATA.cercanias.dests[x.g.far]); return r ? [{ id: x.g.id, at: [r[2], r[3]] as LatLon }] : [] })
  const centre = two && outsideCentre(origin) ? towardCentre(here, ends) : null
  const { dir, pickDir } = useDirChoice('train:' + (item.code ?? ''), two ? opts : [], centre)
  const empty = per.every(x => x.soon === null) ? new Set<string>() : new Set(per.filter(x => x.soon === null).map(x => x.g.id)) // nothing left on either side: no chip is greyed
  const next = two ? per.find(x => x.g.id === dir)?.deps ?? [] : tt ? nextDepartures(tt, now, 3) : []
  // the next 2 planned trains of the shown direction, placed upstream of the station (planned time, not real time; the timetable has no stop times of one trip at several stations)
  const way = two ? dir : groups.length === 1 ? groups[0].id : null
  const trainVeh: Vehicle[] = way && times
    ? upstream(railLine(), here, way === 'hi', nextTwo(next.filter(n => !n.tomorrow && n.inMin <= TRAIN_MAX_MIN).map(n => n.inMin)), TRAIN_KMH).map((p, i) => ({ ...vehicleOf(p, i, 'train', here, (item.code ?? '') + way), via: between(railLine(), p, here) })) : []
  const trainShown: Vehicle[] = trainVeh.length || !way || !times ? trainVeh : [startOf(railLine(), way === 'hi', here, (item.code ?? '') + way, 'train')]
  usePublishVehicles(trainShown)
  const [y, mo, d] = DATA.cercanias.updated?.split('-') ?? []
  const [alerts, setAlerts] = useState<RailAlert[]>([])
  useEffect(() => { let on = true; loadRailAlerts(new Set(DATA.cercanias.rows.map(r => r[0]))).then(a => on && setAlerts(a)); return () => { on = false } }, [])
  const mine = alerts.filter(a => !a.stops.length || (item.code && a.stops.includes(item.code))).slice(0, 2)
  return (
    <>
      <div className="mt-1" data-testid="train-next">
        {!times ? <div role="status"><span className="sr-only">{t('trainLoading')}</span><SkelRows /></div> : two ? (
          <DirRows testId="train-dirs" label={t('dirsLabel')} value={dir} onPick={pickDir} chips={per.map(x => ({
            id: x.g.id, label: DATA.cercanias.dests[x.g.far], empty: empty.has(x.g.id),
            sub: empty.has(x.g.id) ? t('dirNoMore') : x.deps[0] && !x.deps[0].tomorrow ? t('trainIn').replace('{n}', String(x.deps[0].inMin)) : undefined,
            times: empty.has(x.g.id) ? '' : x.deps.slice(0, 2).map(n => n.at).join(' · ') || '—',
          }))} />
        ) : next.length === 0 ? <p className={cn(sub, 'm-0')}>{t('trainNone')}</p> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {next.slice(0, 2).map((n, i) => (
              <li key={i} className="flex items-baseline gap-2 leading-snug" data-testid="train-row">
                <span className={cn('font-bold tabular-nums', i === 0 && 'text-[1.6em] leading-none')}>{n.at}</span>
                <span className="min-w-0 flex-1 truncate">{t('trainTo').replace('{to}', DATA.cercanias.dests[n.dest] ?? '')}</span>
                <span className="text-ink-soft">{n.tomorrow ? t('trainTomorrow') : t('trainIn').replace('{n}', String(n.inMin))}</span>
              </li>
            ))}
          </ul>
        )}
        <More><p className={cn(sub, 'm-0 px-4 pb-1 text-[0.8em]')} data-testid="train-planned">{t('trainPlanned')}{d ? ` · ${t('trainUpdated').replace('{date}', `${d}/${mo}/${y}`)}` : ''}</p></More>
        {mine.map(a => <p key={a.id} className={cn(sub, 'm-0 mt-1 font-semibold text-ink')} role="note" data-testid="train-alert">{a.text} <span className="font-normal">(Renfe)</span></p>)}
        <VehNote show={trainVeh.length > 0} />
      </div>
      <Actions item={item} onWalk={onWalk} fav={fav} />
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
function PharmacyActions({ item, onWalk, fav }: { item: RankedItem; onWalk: () => void; fav: ReactNode }) {
  const { t } = useT()
  const tel = item.phone?.replace(/[^\d+]/g, '')
  return (
    <Actions item={item} onWalk={onWalk} fav={fav} extra={tel && <Button variant="secondary" render={<a href={`tel:${tel}`} />} nativeButton={false} data-testid="call">{t('call')} {item.phone}</Button>} />
  )
}

/** The live list could not be loaded (or is still loading): say so plainly, offer a retry and the city page. Never an old list. */
function LiveMessage({ state, onRetry }: { state: 'loading' | 'failed'; onRetry: () => void }) {
  const { t } = useT()
  if (state === 'loading') return <div className="px-4 py-5" role="status" data-testid="duty-loading"><span className="sr-only">{t('dutyLoading')}</span><SkelRows rows={3} /></div>
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

/** What the line mode needs to show: the line, the direction on show, the stops in order and the place of the current one in them (-1 = none). */
export interface LineView { line: string; dir: number; dirs: number; to?: string; stops: { post: string; name: string; lat: number; lon: number }[]; idx: number; stop?: string }

/** A bus line chosen: "Line 38 · toward X", a way to flip direction, the stops still to come in order, and the link to the next buses. */
export function LineBlock({ view, origin, onBack, onDir }: { view: LineView; origin: LatLon; onBack: () => void; onDir: () => void }) {
  const { t, lang } = useT()
  const det = (detours.lines as Record<string, { until: string; es: string; en: string }>)[view.line]
  const detour = det && det.until >= new Date().toISOString().slice(0, 10) ? det[lang] : (routecheck.lines as Record<string, number>)[view.line] ? t('routeMaybe') : undefined
  // live times of THIS line at this direction's stop (the one the person stands at, on the side of the street this direction uses)
  const here = view.idx >= 0 ? view.stops[view.idx] : undefined
  const post = here && /^\d+$/.test(here.post) ? here.post : undefined
  // when this stop's own data fails, other stops of the same line in this direction are asked (before this one first), see routeAlternatives
  const load = useCallback(async (s: AbortSignal) => {
    await ensureBakedBad()
    return loadBus(post ?? '', s, undefined, undefined, post ? routeAlternatives(view.stops, view.idx, origin) : [], view.line)
  }, [post, view.stops, view.idx, origin, view.line])
  const toEnd = useCallback((a: Arrival[]) => towardEnd(a, view.to), [view.to])
  const title = [t('busLine').replace('{n}', view.line), view.to && t('toward').replace('{to}', view.to)].filter(Boolean).join(' · ')
  const [allStops, setAllStops] = useState(false)
  const from = Math.max(0, view.idx), upcoming = view.stops.slice(from, allStops ? undefined : from + 3), left = view.stops.length - (from + upcoming.length)
  return (
    <m.section key={view.line + view.dir} {...cardSwap} className="px-4 pb-3 pt-4" data-testid="line-block" aria-label={title}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className={h2} data-testid="line-title">{title}</h2>
        </div>
        <BaseButton onClick={onBack} aria-label={t('lineBack')} title={t('lineBack')} data-testid="line-back" render={<m.button {...tap} />} className="-mr-2 -mt-2 inline-flex size-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-brand-text">
          <CloseIcon size="1.4em" weight="bold" aria-hidden />
        </BaseButton>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {view.dirs > 1 && <Button variant="secondary" onClick={onDir} data-testid="line-dir"><ArrowsLeftRight size="1.2em" aria-hidden />{t('otherDir')}</Button>}
      </div>
      {post && <LiveTimes key={post + '|' + view.line} kind="bus" stopKey={post + '|' + view.line} load={load} pick={toEnd} title={t('liveHere')} line={view.line} />}
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
        {(left > 0 || allStops) && <li className="pt-1"><BaseButton onClick={() => setAllStops(v => !v)} aria-expanded={allStops} data-testid="line-more" render={<m.button {...tap} />} className="inline-flex min-h-9 items-center gap-1 rounded-btn border-0 bg-transparent p-0 text-[0.93em] font-bold text-brand-text">{allStops ? t('lineLess') : t('stepMore').replace('{n}', String(left))}<CaretRight size="1em" weight="bold" className={allStops ? '-rotate-90' : 'rotate-90'} aria-hidden /></BaseButton></li>}
      </ol>
      {detour && <More><p className={cn(sub, 'm-0 px-4 pb-2 font-semibold text-ink')} role="note" data-testid="line-detour">{detour}</p></More>}
    </m.section>
  )
}

// ---------- the block with the nearest (or selected) place ----------
/** The ONE answer of the peeking sheet: the place, how far, open or closed, and one Walk button. A tap on the card opens its details. Transit cards show the next times instead of buttons (their links go to the full-height area). */
/** A place has a details page worth opening only when it holds more than the card shows (address, hours, phone, network, a note). Stops and stations do not. */
const hasDetails = (layer: LayerConfig, it: RankedItem) => !!(it.addr || it.phone || it.ssid || it.hours || it.sched || it.note || it.cust || it.shelter || it.type === 'lib' || layer.id === 'wifi')

export function NearestBlock({ layer, item, isSelected, hasPos, origin, cat, routes, times, onLine, onDetails, onWalk }: {
  layer: LayerConfig; item: RankedItem | null; isSelected: boolean; hasPos: boolean; origin: LatLon; cat: string
  routes: BusRoutes | null; times: CercaniasTimes | null; onLine: (line: string) => void
  onDetails: () => void; onWalk: () => void
}) {
  const { t, type } = useT()
  if (!item) return <div className="px-4 py-3"><p className={cn(sub, 'm-0')}>{t('noneOpen')}</p></div>
  const kind = isSelected ? t('selected') : t(('nearest' + layer.id + (layer.id === 'bizi' ? cat : '')) as Key)
  const name = item.name || type(item.type)
  const favBtn = <>
    <FavButton layer={layer} item={item} />
    {hasDetails(layer, item) && <Button variant="secondary" onClick={onDetails} data-testid="details">{t('details')}</Button>}
  </>
  return (
    <m.section key={item.id} {...cardSwap} className="px-4 pb-2 pt-2" data-testid="nearest" aria-label={kind}>
      <div className="flex items-center">
      <div className="flex min-h-[44px] min-w-0 flex-1 items-center text-left text-ink">
        <span className="min-w-0 flex-1">
          <span className={cn(h2, 'block')} data-testid="nearest-name">{name}</span>
          <span className="block font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></span>
          <span className="block"><Status item={item} layer={layer} /></span>
        </span>
      </div>
      </div>
      {/* live occupancy is news worth the peek; "not published" moves to the full-height area */}
      {item.type === 'lib' && (item.buz ? <div className="mt-0.5"><Occupancy item={item} /></div> : <More><div className="px-4 pb-2"><Occupancy item={item} /></div></More>)}
      {item.type === 'bizi' && biziLine(t, item) && <div className="mt-0.5 font-semibold" data-testid="bizi-counts"><Tick>{biziLine(t, item, true)}</Tick></div>}
      {item.type === 'pharmacy' && <PharmacyInfo item={item} />}
      {item.type === 'bus' ? <BusActions item={item} origin={origin} onWalk={onWalk} fav={favBtn} onLine={onLine} lineOk={line => !!routes?.lines[line]} /> : item.type === 'tram' ? <TramActions item={item} origin={origin} onWalk={onWalk} fav={favBtn} /> : item.type === 'train' ? <TrainActions item={item} origin={origin} times={times} onWalk={onWalk} fav={favBtn} /> : item.type === 'pharmacy' ? <PharmacyActions item={item} onWalk={onWalk} fav={favBtn} /> : <Actions item={item} onWalk={onWalk} fav={favBtn} />}
    </m.section>
  )
}

/** The card of a greyed-out place that was tapped on the map: why it is not available, the hours when closed, and where the record comes from. */
export function OffBlock({ item, hasPos }: { item: RankedItem; hasPos: boolean }) {
  const { t, type, lang } = useT()
  const why = t(item.off === 'noBikes' ? 'offNoBikes' : item.off === 'noDocks' ? 'offNoDocks' : item.off === 'notOnDuty' ? 'offNotOnDuty' : 'offClosed')
  const hours = item.off === 'closed' && item.hours ? fmtHours(lang, item.hours) : ''
  return (
    <m.section key={item.id} {...cardSwap} className="px-4 pb-3 pt-4" data-testid="off-card" aria-label={t('offTitle')}>
      <div className={overline}>{t('offTitle')}</div>
      <h2 className={cn(h2, 'mt-1')} data-testid="off-name">{item.name || type(item.type)}</h2>
      <div className="mt-1 font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></div>
      <p className="m-0 mt-1" data-testid="off-reason">{why}</p>
      {item.off === 'notOnDuty' && <p className={cn(sub, 'm-0 mt-0.5')}>{[item.addr, item.phone].filter(Boolean).join(' · ')}</p>}
      {hours && <p className={cn(sub, 'm-0 mt-0.5')}>{t('hours')}: {hours}</p>}
      <div className="flex items-start gap-1"><div className={cn(sub, 'flex-1 pt-2')} data-testid="off-source">{t('source')}: {srcLabel(t, item)}</div><InfoPop label={t('srcInfo')} title={t('srcInfo')}>{srcExplain(t, item)}</InfoPop></div>
    </m.section>
  )
}

/** Which services have filters to set on the Filters page. */
export const hasFilters = (layer: LayerConfig) => !!layer.cats

/** True when a filter is not at its starting value (the Filters button then wears a dot). */
export const filtersOn = (layer: LayerConfig, cat: string) => !!layer.cats && cat !== (layer.catDefault ?? 'all')

/** The Filters page: the same drawer turns to it. The filters of the service you are on, as big chips under a title; a choice applies at once. */
export function FiltersPage({ layer, cat, setCat, onBack, peekRef }: {
  layer: LayerConfig; cat: string; setCat: (c: string) => void; onBack: () => void; peekRef: React.Ref<HTMLDivElement>
}) {
  const { t, lang } = useT()
  const chip = (on: boolean, label: string, onClick: () => void, testId: string) => (
    <button key={testId} type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className={'flex min-h-[44px] min-w-0 grow items-center justify-center rounded-btn border-0 px-2.5 text-[0.87em] font-semibold ' + (on ? 'bg-brand text-on-brand' : 'bg-surface text-ink')}>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
  const head = (text: string) => <div role="heading" aria-level={2} className="mb-3 text-[0.8em] font-extrabold uppercase tracking-wide text-ink">{text}</div>
  const kinds = layer.cats ? [...(layer.id === 'bizi' ? [] : ['all']), ...layer.cats] : []
  return (
    <div ref={peekRef} className="shrink-0">
      <PageHeader title={`${t('filtersLabel')} · ${layer.short[lang]}`} onBack={onBack} />
      <div className="flex flex-col gap-5 px-4 pb-6 pt-2" data-testid="filters">
        {kinds.length > 0 && (
          <div>
            {head(t('typeLabel'))}
            <div className="flex flex-wrap gap-1.5">{kinds.map(c => chip(c === cat, c === 'all' ? t('all') : t(c as Key), () => setCat(c), `filter-${c}`))}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** The notes under the card that are not filters: the Bizi live line, the duty and Bizi hints. */
function Notes({ layer, cat, bizi }: { layer: LayerConfig; cat: string; bizi: Pick<ReturnType<typeof useBizi>, 'state' | 'at' | 'retry'> }) {
  const { t } = useT()
  if (layer.id !== 'pharmacy' && layer.id !== 'bizi') return null
  return (
    <div className="px-4 pb-2">
      {cat !== 'mine' && (
        <div className="mt-1 flex min-h-8 items-center justify-between gap-2" data-testid="bizi-status" data-state={bizi.state}>
          {bizi.state === 'live' && <p className={cn(sub, 'm-0')} role="status">{t('biziLive').replace('{time}', clockMadrid(bizi.at))}</p>}
          {bizi.state === 'loading' && <p className={cn(sub, 'm-0')} role="status"><span className="sr-only">{t('biziLoading')}</span><Skel className="h-[0.8em] w-40 align-middle" /></p>}
          {bizi.state === 'failed' && (
            <>
              <p className={cn(sub, 'm-0 min-w-0')} role="alert"><span className="font-bold text-warn-ink">{t('biziFail')}</span></p>
              <Button variant="link" onClick={bizi.retry} data-testid="bizi-retry">{t('retry')}</Button>
            </>
          )}
        </div>
      )}
      {layer.id === 'pharmacy' ? <p className={cn(sub, 'm-0 py-1')}>{t('dutyNote')} ({madridDate()})</p> : <p className={cn(sub, 'm-0 py-1')}>{t('bizi')}</p>}
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

export function HomePage(p: {
  off: RankedItem | null
  layer: LayerConfig; liveState: 'loading' | 'failed' | null; onRetry: () => void; arr: RankedItem[]; allClosed: boolean; allOut: boolean; denied: boolean; bizi: ReturnType<typeof useBizi>; focus: RankedItem | null; selected: string | null; hasPos: boolean; origin: LatLon; locating: boolean
  peekRef: React.Ref<HTMLDivElement>
  routes: BusRoutes | null; times: CercaniasTimes | null; onLine: (line: string) => void; lineView: LineView | null; onLineBack: () => void; onLineDir: () => void
  cat: string; setCat: (c: string) => void
  locked: boolean; onServices: () => void; chipOrder: LayerId[]
  onFavs: () => void; onFilters: () => void; onLocate: () => void; onDetails: () => void; onWalk: () => void
  viewportRef?: React.Ref<HTMLDivElement>; desktop: boolean
}) {
  const { t } = useT()
  const [more, setMore] = useState<HTMLElement | null>(null)
  const favLayers = useFavs().map(k => splitFav(k)[0] as LayerId)
  return (
    <MoreCtx.Provider value={more}>
      <ServiceHeader layer={p.layer.id} onOpen={p.onServices} favLayers={favLayers} onFavs={p.onFavs} onFilters={hasFilters(p.layer) && !p.liveState && !p.lineView ? p.onFilters : undefined} filtersActive={filtersOn(p.layer, p.cat)} />
      {/* everything down to the end of this block is what the sheet shows at peek: the chip row above it and this one card */}
      <div className="shrink-0" ref={p.peekRef} data-testid="peek-block">
        {p.lineView ? <LineBlock view={p.lineView} origin={p.origin} onBack={p.onLineBack} onDir={p.onLineDir} />
          : p.liveState ? <LiveMessage state={p.liveState} onRetry={p.onRetry} /> : p.off ? <OffBlock item={p.off} hasPos={p.hasPos} /> : <NearestBlock layer={p.layer} item={p.focus} isSelected={!!p.selected} hasPos={p.hasPos} origin={p.origin} cat={p.cat} routes={p.routes} times={p.times} onLine={p.onLine} onDetails={p.onDetails} onWalk={p.onWalk} />}
        {!p.lineView && p.allClosed && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-closed">{t('allClosed')}</p>}
        {p.allOut && <p className={cn(sub, 'm-0 px-4 pb-2')} data-testid="all-out">{t(p.cat === 'return' ? 'biziNoDocks' : 'biziNoBikes')}</p>}
        <Separator />
      </div>
      <Scroll locked={p.locked} viewportRef={p.viewportRef}>
        <div ref={setMore} />
        {!p.liveState && <Notes layer={p.layer} cat={p.cat} bizi={p.bizi} />}
        {!p.liveState && <Locate hasPos={p.hasPos} locating={p.locating} denied={p.denied} onLocate={p.onLocate} />}
      </Scroll>
    </MoreCtx.Provider>
  )
}

// ---------- More, Language, About, Place ----------
function PageRow({ icon, title, description, status, onClick, testId, active }: { icon: ReactNode; title: string; description?: string; status?: string; onClick: () => void; testId: string; active?: boolean }) {
  return (
    <BaseButton onClick={onClick} data-testid={testId} render={<m.button {...tap} />} className={cn('flex min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-transparent px-4 py-2 text-left text-ink [transition:background-color_var(--dur-press)] hov:bg-surface', active && 'bg-brand-tint')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface text-ink">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span>{description && <span className={cn(sub, 'block')}>{description}</span>}</span>
      {status && <span className={sub}>{status}</span>}
      <CaretRight size="1.2em" className="shrink-0 text-ink-soft" aria-hidden />
    </BaseButton>
  )
}

export function SettingsPage({ lang, onClose, go, locked }: { lang: Lang; onClose: () => void; go: (p: 'language' | 'about' | 'install') => void; locked: boolean }) {
  const { t } = useT()
  return (
    <>
      <ViewHeader title={t('settingsTitle')} onClose={onClose} />
      <Scroll locked={locked}>
        <PageRow testId="row-language" icon={<Translate size="1.4em" aria-hidden />} title={t('language')} status={lang === 'en' ? 'English' : 'Español'} onClick={() => go('language')} />
 {!installEnv().standalone && <PageRow testId="row-install" icon={<DownloadSimple size="1.4em" aria-hidden />} title={t('installRow')} onClick={() => go('install')} />}
        <PageRow testId="row-about" icon={<InfoIcon size="1.4em" aria-hidden />} title={t('about')} onClick={() => go('about')} />
        <PageRow testId="row-code" icon={<GithubLogo size="1.4em" aria-hidden />} title={t('codeRow')} description={t('codeHint')} onClick={() => window.open('https://github.com/IFAKA/zaragoza-free-map', '_blank', 'noopener')} />
        <PageRow testId="row-feedback" icon={<ChatCircleText size="1.4em" aria-hidden />} title={t('feedbackRow')} description={t('feedbackHint')} onClick={() => window.open('https://github.com/IFAKA/zaragoza-free-map/issues/new', '_blank', 'noopener')} />
        <PageRow testId="row-support" icon={<Heart size="1.4em" aria-hidden />} title={t('support')} description={t('supportHint')} onClick={() => window.open('https://ko-fi.com/zfaka', '_blank', 'noopener')} />
      </Scroll>
    </>
  )
}

export function InstallPage({ onBack, onClose, locked }: { onBack?: () => void; onClose: () => void; locked: boolean }) {
  const { t } = useT()
  const way = installWay(installEnv())
  const text = way === 'ios' ? t('installIos') : way === 'browser' ? t('installBrowser') : way === 'menu' ? t('installMenu') : t('installHint')
  return (
    <>
      <ViewHeader title={t('installTitle')} onBack={onBack} onClose={onClose} />
      <Scroll locked={locked}>
        <div className="flex flex-col gap-4 px-4 pb-8 pt-2 leading-relaxed">
          <p className="m-0 font-bold">{text}</p>
          {way === 'prompt' && <Button onClick={() => void promptInstall()} data-testid="install-now">{t('installBtn')}</Button>}
        </div>
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
            <Radio.Root key={l} value={l} data-testid={`lang-${l}`} render={<m.button {...tap} />} className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left font-bold text-ink [transition:background-color_var(--dur-press)] hov:bg-surface">
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
          <a className="font-bold text-brand-text" href="https://github.com/IFAKA/zaragoza-free-map" target="_blank" rel="noopener">{t('openSource')}</a>
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

/** The Services page: the same drawer turns to it; its height is the height of its content (peekRef), so the drawer fits it. */
export function ServicesPage({ layer, onPick, onBack, peekRef }: { layer: LayerId; onPick: (id: LayerId) => void; onBack: () => void; peekRef: React.Ref<HTMLDivElement> }) {
  const { t } = useT()
  return (
    <div ref={peekRef} className="shrink-0">
      <PageHeader title={t('tabsLabel')} onBack={onBack} />
      <ServiceGroups layer={layer} onPick={onPick} />
    </div>
  )
}

export function PlacePage({ layer, item, hasPos, onBack, locked, peekRef }: { layer: LayerConfig; item: RankedItem | null; hasPos: boolean; onBack: () => void; locked: boolean; peekRef: (el: HTMLElement | null) => void }) {
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
        <div ref={peekRef} className="flex flex-col gap-3 px-4 pb-8 pt-1">
          <div className={sub}>{type(item.type)}{item.cust ? ` · ${t('cust')}` : ''}{item.note ? ` · ${item.note}` : ''}</div>
          <div className="font-bold">{fmtDist(item.d)} · {walkMins(item.d)} {t('minWalk')} <span className="font-normal text-ink-soft">{hasPos ? t('fromYou') : t('fromCentre')}</span></div>
          <div><Status item={item} layer={layer} /></div>
          {item.shelter && <ShelterNote />}
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
