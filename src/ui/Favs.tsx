import { Check, PencilSimple, Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ICONS } from './icons'
import { LAYERS } from '../layers'
import { lsGet, lsSet } from '../lib/cache'
import { favKey, getSnap, favTitle, splitFav, toggleFav, useFavLabels, useFavs } from '../lib/favs'
import { loadBus, loadTram } from '../lib/live'
import type { Live } from '../lib/live'
import { dist, fmtDist } from '../lib/geo'
import { nowMadrid } from '../lib/hours'
import { itemOpen } from '../lib/rank'
import { OpenDot } from './OpenDot'
import type { Item, LatLon, LayerConfig } from '../lib/types'
import { cn } from './cn'
import { useT } from './lang'
import { tap } from './motion'
import { useLive } from './useLive'
import { toasts } from './ToastHost'

/** The save button of a place card, in its action row: an outline pill with a star and "Save" / "Saved". The first save gives a short message. */
export function FavButton({ layer, item }: { layer: LayerConfig; item: Item }) {
  const { t } = useT()
  const favs = useFavs()
  const [saved, setSaved] = useState(false) // true only after a tap that saves, so opening an already saved place stays still
  const on = favs.includes(favKey(layer.id, item.id))
  const press = () => {
    const first = favs.length === 0 && !lsGet('favFirst')
    setSaved(!on)
    toggleFav(layer.id, item.id, layer.live ? item : undefined)
    if (first && !on) { lsSet('favFirst', '1'); toasts.add({ title: t('favFirst'), timeout: 2500, data: { close: '' } }) }
  }
  return (
    <m.button {...tap} type="button" onClick={press} aria-pressed={on} aria-label={on ? t('favSaved') : t('favSave')} title={on ? t('favSaved') : t('favSave')} data-testid="fav-star"
      className={cn('inline-flex size-11 shrink-0 select-none items-center justify-center rounded-btn border border-line-strong bg-transparent p-0', on ? 'text-brand-text' : 'text-ink')}>
      <span key={on ? 'on' : 'off'} className={cn('grid', on && saved && 'star-save')}><Star size="1.4em" weight={on ? 'fill' : 'regular'} aria-hidden /></span>
    </m.button>
  )
}

export interface Fav { key: string; layer: LayerConfig; item: Item }
/** The saved places that still exist in the data, in the saved (recency) order. */
export function resolveFavs(keys: string[]): Fav[] {
  return keys.flatMap<Fav>(key => {
    const [lid, id] = splitFav(key)
    const layer = LAYERS[lid as keyof typeof LAYERS]
    const item = layer?.items.find(i => i.id === id) ?? (layer?.live ? getSnap(key) : null)
    return item ? [{ key, layer, item }] : []
  })
}
export const isLiveFav = (item: Item) => (item.type === 'bus' && !!item.stop) || (item.type === 'tram' && !!item.tramIds?.length)

export interface Arr { line: string; text: string }
/** The next arrivals of a bus or tram favourite (the first 2, soonest first), asked and refreshed like the stop card does (useLive, every 30 s). `on` false: nothing is asked (a row that is not on screen). */
export function useFavLive(fav: Fav, on: boolean): { live: Live | null; arrs: Arr[] } {
  const { t } = useT()
  const { item } = fav
  const ids = item.tramIds?.join(',') ?? ''
  const load = useCallback((s: AbortSignal) => (!on || !isLiveFav(item) ? Promise.resolve(null) : item.type === 'tram' ? loadTram(ids ? ids.split(',') : [], s) : loadBus(item.stop ?? '', s)), [on, item, ids])
  const { live } = useLive(fav.key + (on ? '+' : ''), load)
  // times of a neighbour stop would be wrong here: name only
  const arrs = on && live && !live.via ? [...live.arrivals].filter(a => a.mins.length).sort((a, b) => a.mins[0] - b.mins[0]).slice(0, 2).map(a => ({ line: a.line, text: a.mins[0] === 0 ? t('liveNow') : t('liveMin').replace('{n}', String(a.mins[0])) })) : []
  return { live, arrs }
}

const MOVED_M = 100
/** The position the favourites are ranked by: follows `pos` only after a move of more than 100 m, so the rows do not jump on every GPS update. */
export function useSteadyPos(pos: LatLon | null): LatLon | null {
  const [steady, setSteady] = useState(pos)
  const last = useRef(pos)
  if (!pos ? last.current : !last.current || dist(pos, last.current) > MOVED_M) { last.current = pos; setSteady(pos) }
  return steady
}

/** One favourite as a row (60 to 64 px): layer icon, name, distance, and on the right the next 2 arrivals (bus, tram) or open / closed (places). The right column keeps its width while the times load, then they fade in. With `mode`: edit (tap to rename) or delete (tap to tick). */
export function FavRow({ fav, pos, onOpen, mode, checked, onToggle, onRename, full, compact, trailing }: { fav: Fav; pos: LatLon | null; onOpen: (layer: string, id: string) => void; mode?: 'edit' | 'delete'; checked?: boolean; onToggle?: (key: string) => void; onRename?: (key: string) => void; full?: boolean; compact?: boolean; trailing?: React.ReactNode }) {
  const { t, lang, type } = useT()
  const labels = useFavLabels()
  const label = labels[fav.key]
  const ref = useRef<HTMLLIElement>(null)
  const [vis, setVis] = useState(false)
  const live = isLiveFav(fav.item)
  useEffect(() => {
    const el = ref.current
    if (!el || !live) return
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [live])
  const { arrs: all } = useFavLive(fav, vis)
  const arrs = compact ? all.slice(0, 1) : all // the home row has room for one arrival
  const I = ICONS[fav.layer.icon]
  const name = fav.item.name || type(fav.item.type) // some map places have no name: their kind
  const title = favTitle(name, label)
  const open = !live && fav.layer.hours ? itemOpen(fav.item, nowMadrid()) : null
  const d = pos ? fmtDist(dist(pos, [fav.item.lat, fav.item.lon])) : ''
  const sub = (full ? [label ? name : '', d, fav.layer.label[lang]] : [d || fav.layer.label[lang]]).filter(Boolean).join(' · ')
  const aria = arrs.length ? `${title}: ${arrs.map(a => `${a.line} ${a.text}`).join(', ')}` : title
  const body = (
    <>
      {compact && <Star size="0.9em" weight="fill" className="-mr-1 shrink-0 text-brand-text" aria-hidden />}
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile text-on-brand" style={{ background: fav.layer.color }}><I size="1.4em" weight="fill" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{title}</span>
        <span className="block truncate text-[0.82em] text-ink-soft">{sub}</span>
      </span>
      {live ? (
        <span className="flex min-h-10 w-[6.5rem] shrink-0 flex-col items-end justify-center gap-0.5" data-testid="fav-times">
          {arrs.map(a => (
            <span key={a.line + a.text} className="fav-fade flex items-center gap-1.5 text-[0.88em] leading-none" data-testid="fav-time">
              <span className={cn('min-w-[2.2em] rounded-[0.3em] px-1.5 py-0.5 text-center text-[0.93em] font-bold text-on-brand', fav.item.type === 'bus' ? 'bg-bus' : 'bg-[var(--color-tram)]')}>{a.line}</span>
              <span className="min-w-[3.6ch] text-right font-bold tabular-nums">{a.text}</span>
            </span>
          ))}
        </span>
      ) : open !== null && (
        <OpenDot open={open} testId="fav-open" className="shrink-0 text-[0.88em]">{open ? t('openShort') : t('closedShort')}</OpenDot>
      )}
    </>
  )
  // manage modes: only what is needed. Edit: the whole row opens the rename view (pencil at the end). Delete: the whole row ticks a circle at the start. No times, no distance.
  if (mode) {
    const del = mode === 'delete'
    return (
      <li ref={ref} className="fav-row border-b border-line" data-testid="fav-row">
        <m.button {...tap} type="button" onClick={() => (del ? onToggle?.(fav.key) : onRename?.(fav.key))} data-testid={del ? 'fav-row-select' : 'fav-rename-open'}
          {...(del ? { role: 'checkbox', 'aria-checked': !!checked } : {})} aria-label={del ? title : `${t('favRename')}: ${title}`}
          className="flex min-h-16 w-full select-none items-center gap-3 border-0 bg-transparent py-2 pl-4 pr-4 text-left text-ink">
          {del && <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2 [transition:background-color_var(--dur-small)_var(--ease-out)]', checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-transparent text-transparent')}><Check size="0.9em" weight="bold" aria-hidden /></span>}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words font-bold leading-snug" data-testid="fav-name">{title}</span>
            <span className="block truncate text-[0.82em] text-ink-soft">{[label ? name : '', fav.layer.label[lang]].filter(Boolean).join(' · ')}</span>
          </span>
          {!del && <PencilSimple size="1.2em" className="shrink-0 text-ink-soft" aria-hidden />}
        </m.button>
      </li>
    )
  }
  return (
    <li ref={ref} className="fav-row flex min-h-16 items-center border-b border-line" data-testid="fav-row">
      <m.button {...tap} type="button" onClick={() => onOpen(fav.layer.id, fav.item.id)} aria-label={aria} data-testid="fav-open-row"
        className={cn('flex min-h-16 min-w-0 flex-1 select-none items-center gap-3 border-0 bg-transparent py-2 pl-4 text-left text-ink', trailing ? 'pr-1' : 'pr-4')}>{body}</m.button>
      {trailing}
    </li>
  )
}
