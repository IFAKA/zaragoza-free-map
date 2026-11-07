import { Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useCallback } from 'react'
import { LAYERS } from '../layers'
import { canFav, favKey, splitFav, toggleFav, useFavs } from '../lib/favs'
import { loadBus, loadTram } from '../lib/live'
import type { Live } from '../lib/live'
import type { Item, LayerConfig } from '../lib/types'
import { cn } from './cn'
import { useT } from './lang'
import { tap } from './motion'
import { useLive } from './useLive'

/** The star of a place card: save the place as a favourite (or remove it). Not shown for places that cannot be saved. */
export function FavButton({ layer, item }: { layer: LayerConfig; item: Item }) {
  const { t } = useT()
  const favs = useFavs()
  if (!canFav(layer, item)) return null
  const on = favs.includes(favKey(layer.id, item.id))
  const label = `${on ? t('favRemove') : t('favAdd')}: ${item.name}`
  return (
    <m.button {...tap} type="button" onClick={() => toggleFav(layer.id, item.id)} aria-label={label} aria-pressed={on} data-testid="fav-star"
      className={cn('grid size-11 shrink-0 select-none place-items-center rounded-full border-0 bg-transparent p-0', on ? 'text-brand-text' : 'text-ink-soft')}>
      <Star size="1.5em" weight={on ? 'fill' : 'regular'} aria-hidden />
    </m.button>
  )
}

interface Fav { key: string; layer: LayerConfig; item: Item }

function Chip({ fav, live, onOpen }: { fav: Fav; live: Live | null; onOpen: (layer: string, id: string) => void }) {
  const { t } = useT()
  const a = live && !live.via ? live.arrivals[0] : undefined // times of a neighbour stop would be wrong here: name only
  const mins = a ? (a.mins[0] === 0 ? t('liveNow') : t('liveMin').replace('{n}', String(a.mins[0]))) : ''
  return (
    <m.button {...tap} type="button" onClick={() => onOpen(fav.layer.id, fav.item.id)} data-testid="fav-chip" aria-label={a ? `${fav.item.name}: ${a.line} ${mins}` : fav.item.name}
      className="flex min-h-11 max-w-[14rem] shrink-0 select-none items-center gap-2 rounded-full border-0 bg-surface px-3 text-[0.93em] font-semibold text-ink">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: fav.layer.color }} aria-hidden />
      <span className="min-w-0 truncate">{fav.item.name}</span>
      {a && <span className="shrink-0 tabular-nums text-brand-text"><span className="text-[0.85em] text-ink-soft">{a.line}</span> {mins}</span>}
    </m.button>
  )
}

/** A chip of a bus or tram stop: its next arrival, asked and refreshed like the stop card does (useLive, every 30 s). */
function LiveChip({ fav, onOpen }: { fav: Fav; onOpen: (layer: string, id: string) => void }) {
  const { item } = fav
  const ids = item.tramIds?.join(',') ?? ''
  const load = useCallback((s: AbortSignal) => (item.type === 'tram' ? loadTram(ids ? ids.split(',') : [], s) : loadBus(item.stop ?? '', s)), [item.type, item.stop, ids])
  const { live } = useLive(fav.key, load)
  return <Chip fav={fav} live={live} onOpen={onOpen} />
}

/** The favourites strip at the top of the home page: one chip per saved place, scrolling sideways. Places that are no longer in the data are skipped. Empty: nothing. */
export function FavStrip({ onOpen }: { onOpen: (layer: string, id: string) => void }) {
  const { t } = useT()
  const favs = useFavs()
  const list = favs.flatMap<Fav>(key => {
    const [lid, id] = splitFav(key)
    const layer = LAYERS[lid as keyof typeof LAYERS]
    const item = layer?.items.find(i => i.id === id)
    return item ? [{ key, layer, item }] : []
  })
  if (!list.length) return null
  return (
    <ul className="m-0 flex shrink-0 list-none gap-2 overflow-x-auto px-4 pb-2 pt-0 [scrollbar-width:none]" aria-label={t('favsLabel')} data-testid="fav-strip">
      {list.map(f => (
        <li key={f.key} className="flex">
          {f.item.type === 'bus' && f.item.stop || f.item.type === 'tram' && f.item.tramIds?.length ? <LiveChip fav={f} onOpen={onOpen} /> : <Chip fav={f} live={null} onOpen={onOpen} />}
        </li>
      ))}
    </ul>
  )
}
