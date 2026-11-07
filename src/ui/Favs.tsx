import { Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LAYERS } from '../layers'
import { lsGet, lsSet } from '../lib/cache'
import { canFav, favKey, nearestFavs, splitFav, toggleFav, useFavs } from '../lib/favs'
import { loadBus, loadTram } from '../lib/live'
import type { Live } from '../lib/live'
import { dist } from '../lib/geo'
import type { Item, LatLon, LayerConfig } from '../lib/types'
import { cn } from './cn'
import { useT } from './lang'
import { tap } from './motion'
import { useLive } from './useLive'
import { toasts } from './ToastHost'

/** The save button of a place card, in its action row: an outline pill with a star and "Save" / "Saved". Not shown for places that cannot be saved. The first save gives a short message. */
export function FavButton({ layer, item }: { layer: LayerConfig; item: Item }) {
  const { t } = useT()
  const favs = useFavs()
  if (!canFav(layer, item)) return null
  const on = favs.includes(favKey(layer.id, item.id))
  const press = () => {
    const first = favs.length === 0 && !lsGet('favFirst')
    toggleFav(layer.id, item.id)
    if (first && !on) { lsSet('favFirst', '1'); toasts.add({ title: t('favFirst'), timeout: 2500, data: { close: t('close') } }) }
  }
  return (
    <m.button {...tap} type="button" onClick={press} aria-pressed={on} data-testid="fav-star"
      className={cn('inline-flex min-h-[44px] select-none items-center justify-center gap-2 rounded-btn border border-line-strong bg-transparent px-4 font-semibold', on ? 'text-brand-text' : 'text-ink')}>
      <span key={on ? 'on' : 'off'} className={cn('grid', on && 'star-pop')}><Star size="1.2em" weight={on ? 'fill' : 'regular'} aria-hidden /></span>
      {on ? t('favSaved') : t('favSave')}
    </m.button>
  )
}

export interface Fav { key: string; layer: LayerConfig; item: Item }
/** The saved places that still exist in the data, in the saved (recency) order. */
export function resolveFavs(keys: string[]): Fav[] {
  return keys.flatMap<Fav>(key => {
    const [lid, id] = splitFav(key)
    const layer = LAYERS[lid as keyof typeof LAYERS]
    const item = layer?.items.find(i => i.id === id)
    return item ? [{ key, layer, item }] : []
  })
}
export const isLiveFav = (item: Item) => (item.type === 'bus' && !!item.stop) || (item.type === 'tram' && !!item.tramIds?.length)

/** The next arrival of a bus or tram favourite, asked and refreshed like the stop card does (useLive, every 30 s). `on` false: nothing is asked (a row that is not on screen). */
export function useFavLive(fav: Fav, on: boolean): { live: Live | null; text: string; line: string } {
  const { t } = useT()
  const { item } = fav
  const ids = item.tramIds?.join(',') ?? ''
  const load = useCallback((s: AbortSignal) => (!on || !isLiveFav(item) ? Promise.resolve(null) : item.type === 'tram' ? loadTram(ids ? ids.split(',') : [], s) : loadBus(item.stop ?? '', s)), [on, item, ids])
  const { live } = useLive(fav.key + (on ? '+' : ''), load)
  const a = on && live && !live.via ? live.arrivals[0] : undefined // times of a neighbour stop would be wrong here: name only
  return { live, line: a?.line ?? '', text: a ? (a.mins[0] === 0 ? t('liveNow') : t('liveMin').replace('{n}', String(a.mins[0]))) : '' }
}

let seen = false // the chips enter once per visit to the app, not on every return to Home
function Chip({ fav, i, enter, onOpen }: { fav: Fav; i: number; enter: boolean; onOpen: (layer: string, id: string) => void }) {
  const { text, line } = useFavLive(fav, isLiveFav(fav.item))
  return (
    <li className={cn('flex min-w-0 flex-1', enter && 'fav-in')} data-i={i}>
      <m.button {...tap} type="button" onClick={() => onOpen(fav.layer.id, fav.item.id)} data-testid="fav-chip" aria-label={text ? `${fav.item.name}: ${line} ${text}` : fav.item.name}
        className="flex h-11 w-full min-w-0 select-none items-center gap-1.5 rounded-full border-0 bg-surface px-2.5 text-[0.9em] font-semibold text-ink">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: fav.layer.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{fav.item.name.replace(/^P\.\s+/, '')}</span>
        {text && <span className="shrink-0 text-[0.88em] tabular-nums text-brand-text">{text.replace(' min', "'")}</span>}
      </m.button>
    </li>
  )
}

/** The favourites strip at the top of the home page: one fixed-height row, at most 2 chips (the ones nearest to the user; the ones opened last when the position is unknown), then an "All (N)" chip as the third slot that opens the Favourites page. With 2 or fewer, a star at the start opens the page. Places that are no longer in the data are skipped. Empty: nothing. */
const MOVED_M = 100
/** The position the strip ranks by: follows `pos` only after a move of more than 100 m, so the chips do not jump on every GPS update. */
function useSteadyPos(pos: LatLon | null): LatLon | null {
  const [steady, setSteady] = useState(pos)
  const last = useRef(pos)
  if (!pos ? last.current : !last.current || dist(pos, last.current) > MOVED_M) { last.current = pos; setSteady(pos) }
  return steady
}

export function FavStrip({ onOpen, onAll, pos }: { onOpen: (layer: string, id: string) => void; onAll: () => void; pos: LatLon | null }) {
  const { t } = useT()
  const list = resolveFavs(useFavs())
  const steady = useSteadyPos(pos)
  const shown = nearestFavs(list, steady, 2)
  const [enter] = useState(!seen)
  useEffect(() => { seen = true }, [])
  if (!list.length) return null
  const more = list.length > 2
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 mb-2 px-4" data-testid="fav-strip">
      {!more && (
        <m.button {...tap} type="button" onClick={onAll} aria-label={t('favsOpen')} data-testid="fav-all-star" className="-ml-2 grid size-11 shrink-0 select-none place-items-center rounded-full border-0 bg-transparent p-0 text-brand-text">
          <Star size="1.3em" weight="fill" aria-hidden />
        </m.button>
      )}
      <ul className={cn('m-0 flex min-w-0 list-none gap-2 p-0', more ? 'flex-[2]' : 'flex-1')} aria-label={t('favsLabel')}>
        {shown.map((f, i) => <Chip key={f.key} fav={f} i={i} enter={enter} onOpen={onOpen} />)}
      </ul>
      {more && (
        <m.button {...tap} type="button" onClick={onAll} data-testid="fav-all" aria-label={t('favsOpen')}
          className="flex h-11 min-w-0 flex-1 select-none items-center justify-center gap-1 rounded-full border-0 bg-brand-tint px-2.5 text-[0.9em] font-bold text-brand-text">
          <Star size="1.1em" weight="fill" aria-hidden />{t('favsAll').replace('{n}', String(list.length))}
        </m.button>
      )}
    </div>
  )
}
