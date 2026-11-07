import { CaretRight, Minus, PencilSimple, Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ICONS } from './icons'
import { LAYERS } from '../layers'
import { lsGet, lsSet } from '../lib/cache'
import { LABEL_MAX, canFav, favKey, favTitle, nearestFavs, setLabel, splitFav, toggleFav, useFavLabels, useFavs } from '../lib/favs'
import { loadBus, loadTram } from '../lib/live'
import type { Live } from '../lib/live'
import { dist, fmtDist } from '../lib/geo'
import { nowMadrid } from '../lib/hours'
import { itemOpen } from '../lib/rank'
import type { Item, LatLon, LayerConfig } from '../lib/types'
import { cn } from './cn'
import { useT } from './lang'
import { MS, tap } from './motion'
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

/** One favourite as a row (60 to 64 px): layer icon, name, distance, and on the right the next 2 arrivals (bus, tram) or open / closed (places). The right column keeps its width while the times load, then they fade in. With `edit`: a remove button at the start and the name turns into a rename field. */
export function FavRow({ fav, pos, onOpen, edit, onRemove, full }: { fav: Fav; pos: LatLon | null; onOpen: (layer: string, id: string) => void; edit?: boolean; onRemove?: (key: string) => void; full?: boolean }) {
  const { t, lang, type } = useT()
  const labels = useFavLabels()
  const label = labels[fav.key]
  const ref = useRef<HTMLLIElement>(null)
  const [vis, setVis] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const live = isLiveFav(fav.item)
  useEffect(() => {
    const el = ref.current
    if (!el || !live) return
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [live])
  useEffect(() => { if (!edit) setRenaming(false) }, [edit])
  const { arrs } = useFavLive(fav, vis)
  const I = ICONS[fav.layer.icon]
  const name = fav.item.name || type(fav.item.type) // some map places have no name: their kind
  const title = favTitle(name, label)
  const open = !live && fav.layer.hours ? itemOpen(fav.item, nowMadrid()) : null
  const d = pos ? fmtDist(dist(pos, [fav.item.lat, fav.item.lon])) : ''
  const sub = (full ? [label ? name : '', d, fav.layer.label[lang]] : [d || fav.layer.label[lang]]).filter(Boolean).join(' · ')
  const aria = arrs.length ? `${title}: ${arrs.map(a => `${a.line} ${a.text}`).join(', ')}` : title
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-tile text-on-brand" style={{ background: fav.layer.color }}><I size="1.4em" weight="fill" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        {renaming ? (
          <input autoFocus defaultValue={label ?? ''} maxLength={LABEL_MAX} placeholder={name} aria-label={t('favRename')} data-testid="fav-rename" enterKeyHint="done"
            onFocus={e => e.currentTarget.select()}
            onBlur={e => { setLabel(fav.key, e.currentTarget.value); setRenaming(false) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.currentTarget.value = label ?? ''; e.currentTarget.blur() } }}
            className="block h-9 w-full min-w-0 rounded-btn border border-line-strong bg-paper px-2 text-[16px] font-bold text-ink placeholder:font-normal placeholder:text-ink-soft" />
        ) : <span className="flex items-center gap-1.5 font-bold"><span className="truncate">{title}</span>{edit && <PencilSimple size="0.9em" className="shrink-0 text-ink-soft" aria-hidden />}</span>}
        {!renaming && <span className="block truncate text-[0.82em] text-ink-soft">{sub}</span>}
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
        <span className={cn('shrink-0 text-right text-[0.88em] font-semibold', open ? 'text-success-ink' : 'text-ink-soft')} data-testid="fav-open">{open ? t('open') : t('closed')}</span>
      )}
    </>
  )
  return (
    <li ref={ref} className="fav-row flex min-h-16 items-center border-b border-line" data-leaving={leaving ? '' : undefined} data-testid="fav-row">
      {edit && (
        <m.button {...tap} type="button" aria-label={`${t('favRemove')}: ${title}`} data-testid="fav-row-remove"
          onClick={e => { if (leaving || !onRemove) return; if (e.detail === 0) return onRemove(fav.key); setLeaving(true); setTimeout(() => onRemove(fav.key), MS.small) }}
          className="ml-1 grid size-11 shrink-0 select-none place-items-center rounded-full border-0 bg-transparent p-0">
          <span className="grid size-6 place-items-center rounded-full bg-brand text-on-brand"><Minus size="1em" weight="bold" aria-hidden /></span>
        </m.button>
      )}
      {edit ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-2 pr-4 text-left text-ink">
          {renaming ? body : (
            <button type="button" onClick={() => setRenaming(true)} aria-label={`${t('favRename')}: ${title}`} data-testid="fav-rename-open" className="flex min-w-0 flex-1 select-none items-center gap-3 border-0 bg-transparent p-0 text-left text-ink">{body}</button>
          )}
        </div>
      ) : (
        <m.button {...tap} type="button" onClick={() => onOpen(fav.layer.id, fav.item.id)} aria-label={aria} data-testid="fav-open-row"
          className="flex min-h-16 min-w-0 flex-1 select-none items-center gap-3 border-0 bg-transparent py-2 pl-4 pr-4 text-left text-ink">{body}</m.button>
      )}
    </li>
  )
}

/** A short phone screen (about 640 px high): the sheet at peek may cover only 72% of it, so the section shows 1 row and the nearest-place card still fits whole. */
function useShort(): boolean {
  const q = '(max-height: 699px)'
  const [v, setV] = useState(() => matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const f = () => setV(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [])
  return v
}

/** The Favourites section of the home page: a header ("Favourites", "See all (N)" with a chevron, one 44 px tap target that opens the page) and the 2 favourites nearest to the user as rows (the ones opened last when the position is unknown). Nothing when there is no favourite. */
export function FavSection({ onOpen, onAll, pos }: { onOpen: (layer: string, id: string) => void; onAll: () => void; pos: LatLon | null }) {
  const { t } = useT()
  const list = resolveFavs(useFavs())
  const steady = useSteadyPos(pos)
  const short = useShort()
  if (!list.length) return null
  const shown = nearestFavs(list, steady, short ? 1 : 2)
  return (
    <section className="shrink-0" aria-label={t('favsTitle')} data-testid="fav-section">
      <m.button {...tap} type="button" onClick={onAll} aria-label={`${t('favsTitle')}: ${t('favsSee').replace('{n}', String(list.length))}`} data-testid="fav-all"
        className="flex min-h-11 w-full select-none items-center justify-between gap-2 border-0 bg-transparent px-4 text-left">
        <span className="font-title text-[1.1em] font-semibold text-ink">{t('favsTitle')}</span>
        <span className="flex items-center gap-0.5 font-semibold text-brand-text">{t('favsSee').replace('{n}', String(list.length))}<CaretRight size="1.1em" weight="bold" aria-hidden /></span>
      </m.button>
      <ul className="m-0 list-none border-t border-line p-0" aria-label={t('favsLabel')}>
        {shown.map(f => <FavRow key={f.key} fav={f} pos={steady} onOpen={onOpen} />)}
      </ul>
    </section>
  )
}
