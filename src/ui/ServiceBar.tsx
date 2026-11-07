import { AnimatePresence, m } from 'motion/react'
import { Plus, SlidersHorizontal, Star } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { LAYERS } from '../layers'
import type { LayerId } from '../lib/types'
import { useT } from './lang'
import { ICONS } from './icons'
import { TEASER_EVERY, cardSwap, slotSwap, tap } from './motion'

export const GROUPS: { id: string; label: { en: string; es: string }; ids: LayerId[] }[] = [
  { id: 'basics', label: { en: 'Basics', es: 'Básicos' }, ids: ['toilets', 'water', 'pharmacy', 'shelter'] },
  { id: 'transport', label: { en: 'Transport', es: 'Transporte' }, ids: ['bus', 'tram', 'bizi', 'cercanias'] },
  { id: 'connect', label: { en: 'Connect', es: 'Conectar' }, ids: ['wifi', 'charge', 'libraries'] },
]

/**
 * The header of the home page (about 64 px): the service you are on (left, plain: icon and name, no subtitle) and one button (right) that shows four of the other services.
 * The button turns the drawer to the Services page (same drawer, new page). `order` is the person's own order, so the four are the ones they use most.
 */
export function ServiceHeader({ layer, order, onOpen, onShow, favLayers, onFavs, onFilters, filtersActive }: { layer: LayerId; order: LayerId[]; onOpen: () => void; onShow: () => void; favLayers: LayerId[]; onFavs: () => void; onFilters?: () => void; filtersActive?: boolean }) {
  const { lang, t } = useT()
  const cur = LAYERS[layer], I = ICONS[cur.icon]
  const others = order.filter(id => id !== layer)
  const mine = others.slice(0, 3)
  const [shown, setShown] = useState<LayerId[]>(mine)
  const key = mine.join()
  // the teaser: each time a service opens, the four icons swap one at a time through the other services, then settle on the person's own four
  useEffect(() => {
    setShown(mine)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let n = 0
    const id = setInterval(() => {
      n++
      if (n > others.length + 2) { setShown(mine); clearInterval(id); return }
      setShown(s => s.map((x, k) => (k === (n - 1) % 3 ? others[(2 + n) % others.length] : x)))
    }, TEASER_EVERY)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (
    <div role="group" aria-label={t('tabsLabel')} data-testid="services" className="shrink-0">
      <div className="flex items-center gap-2 px-4 pb-1.5 pt-1">
        <button type="button" onClick={onShow} data-testid="service-on-show" className="flex min-w-0 flex-1 select-none items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-btn text-on-brand" style={{ background: cur.color }}><m.span key={layer} {...cardSwap} className="flex"><I size="1.6em" weight="fill" aria-hidden /></m.span></span>
        <m.span key={layer + 't'} {...cardSwap} className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words font-title text-[1.15em] font-bold leading-tight text-ink">{cur.label[lang]}</span>
        </m.span>
        </button>
        {onFilters && (
          <m.button {...tap} type="button" onClick={onFilters} aria-label={t('filtersLabel')} data-testid="filters-open"
            className="relative grid size-14 shrink-0 place-items-center rounded-[14px] border-[1.5px] border-line bg-paper text-ink shadow-md">
            <SlidersHorizontal size="1.5em" weight="bold" aria-hidden />
            {filtersActive && <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-brand" />}
          </m.button>
        )}
        <FavGrid layers={favLayers} onClick={onFavs} />
        <m.button {...tap} type="button" onClick={onOpen} aria-label={t('tabsLabel')} data-testid="services-open"
          className="relative grid size-14 shrink-0 grid-cols-2 grid-rows-2 place-items-center gap-0.5 rounded-[14px] border-[1.5px] border-line bg-paper p-[5px] text-ink shadow-md">
          {shown.map((id, k) => { const J = ICONS[LAYERS[id].icon]; return (
            <span key={k} className="relative grid size-full place-items-center">
              <AnimatePresence initial={false}><m.span key={id} data-layer={id} {...slotSwap} className="absolute inset-0 grid place-items-center"><J size="1.15em" weight="fill" aria-hidden /></m.span></AnimatePresence>
            </span>) })}
          <span className="grid size-full place-items-center rounded-full bg-brand text-on-brand"><Plus size="1em" weight="bold" aria-hidden /></span>
        </m.button>
      </div>
    </div>
  )
}

/**
 * The Favourites button, the twin of the Services button: a 2x2 grid whose bottom right is the star. The other three places show the service icon of a saved favourite, or an empty star while there is none to show.
 * With more than three kinds saved, the three places swap one at a time through the kinds, like the Services button does.
 */
function FavGrid({ layers, onClick }: { layers: LayerId[]; onClick: () => void }) {
  const { t } = useT()
  const kinds = [...new Set(layers)]
  const mine = kinds.slice(0, 3)
  const [shown, setShown] = useState<LayerId[]>(mine)
  const key = kinds.join()
  useEffect(() => {
    setShown(mine)
    if (kinds.length <= 3 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let n = 0
    const id = setInterval(() => {
      n++
      if (n > kinds.length + 2) { setShown(mine); clearInterval(id); return }
      setShown(s => s.map((x, k) => (k === (n - 1) % 3 ? kinds[(2 + n) % kinds.length] : x)))
    }, TEASER_EVERY)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (
    <m.button {...tap} type="button" onClick={onClick} aria-label={`${t('favsTitle')}${layers.length ? `: ${t('favsSee').replace('{n}', String(layers.length))}` : ''}`} data-testid="fav-all"
      className="relative grid size-14 shrink-0 grid-cols-2 grid-rows-2 place-items-center gap-0.5 rounded-[14px] border-[1.5px] border-line bg-paper p-[5px] text-ink shadow-md">
      {[0, 1, 2].map(k => { const id = shown[k], J = id ? ICONS[LAYERS[id].icon] : null; return (
        <span key={k} className="relative grid size-full place-items-center">
          <AnimatePresence initial={false}>
            <m.span key={id ?? 'empty'} data-layer={id} {...slotSwap} className="absolute inset-0 grid place-items-center">
              {J ? <J size="1.15em" weight="fill" aria-hidden /> : <Star size="1.15em" className="text-line-strong" aria-hidden />}
            </m.span>
          </AnimatePresence>
        </span>) })}
      <span className="grid size-full place-items-center rounded-full bg-brand text-on-brand"><Star size="1em" weight="fill" aria-hidden /></span>
    </m.button>
  )
}

/** The Services page body: every service, in three groups, with names. The service you are on is filled. */
export function ServiceGroups({ layer, onPick }: { layer: LayerId; onPick: (id: LayerId) => void }) {
  const { lang } = useT()
  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
      {GROUPS.map(g => (
        <div key={g.id}>
          <div role="heading" aria-level={2} className="mb-3 text-[0.8em] font-extrabold uppercase tracking-wide text-ink">{g.label[lang]}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.ids.map(id => {
              const J = ICONS[LAYERS[id].icon], on = id === layer
              return (
                <m.button {...tap} key={id} type="button" onClick={() => onPick(id)} aria-pressed={on} data-testid={`tab-${id}`}
                  className={'flex min-h-[44px] min-w-0 grow items-center justify-center gap-1.5 rounded-btn border-0 px-2.5 text-[0.87em] font-semibold ' + (on ? 'bg-brand text-on-brand' : 'bg-surface text-ink')}>
                  <J size="1.3em" className="shrink-0" weight={on ? 'fill' : 'regular'} aria-hidden /><span className="min-w-0 truncate">{LAYERS[id].short[lang]}</span>
                </m.button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
