import { m } from 'motion/react'
import { ListMagnifyingGlass, SlidersHorizontal, Star } from '@phosphor-icons/react'
import { LAYERS } from '../layers'
import type { LayerId } from '../lib/types'
import { cn } from './cn'
import { useT } from './lang'
import { ICONS } from './icons'
import { tap } from './motion'

export const GROUPS: { id: string; label: { en: string; es: string }; ids: LayerId[] }[] = [
  { id: 'basics', label: { en: 'Basics', es: 'Básicos' }, ids: ['toilets', 'water', 'pharmacy', 'shelter'] },
  { id: 'transport', label: { en: 'Transport', es: 'Transporte' }, ids: ['bus', 'tram', 'bizi', 'cercanias'] },
  { id: 'connect', label: { en: 'Connect', es: 'Conectar' }, ids: ['wifi', 'charge', 'libraries'] },
]

/**
 * The header of the home page (about 64 px): two equal text buttons (Favourites, Services with a magnifier so it is clear it is for finding a service). The service you are on is named in the card below, above the place.
 * The Services button turns the drawer to the Services page (same drawer, new page).
 */
/** Height of the phone footer bar (px), without the bottom safe area. The home page keeps this much room at its end, and the closed sheet ends above it. */
export const FOOTER_PX = 72
export function ServiceHeader({ onOpen, favLayers, onFavs, onFilters, filtersActive, bar }: { bar?: boolean; onOpen: () => void; favLayers: LayerId[]; onFavs: () => void; onFilters?: () => void; filtersActive?: boolean }) {
  const { t } = useT()
  return (
    <div role="group" aria-label={t('tabsLabel')} data-testid="services" className={bar ? 'fixed inset-x-0 bottom-0 z-[51] bg-paper pb-[env(safe-area-inset-bottom)]' : '-mt-2 shrink-0'}>
      <div className={cn('flex items-center gap-2 px-4', bar ? 'h-[72px]' : 'pb-3 pt-0')}>
        {onFilters && (
          <m.button {...tap} type="button" onClick={onFilters} aria-label={t('filtersLabel')} data-testid="filters-open"
            className="relative grid size-14 shrink-0 place-items-center rounded-[14px] border-[1.5px] border-line bg-paper text-ink shadow-md">
            <SlidersHorizontal size="1.5em" weight="bold" aria-hidden />
            {filtersActive && <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-brand" />}
          </m.button>
        )}
        <m.button {...tap} type="button" onClick={onFavs} aria-label={`${t('favsTitle')}${favLayers.length ? `: ${t('favsSee').replace('{n}', String(favLayers.length))}` : ''}`} data-testid="fav-all"
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border-0 bg-brand px-3 font-bold text-on-brand shadow-md">
          <Star size="1.3em" weight="fill" aria-hidden />{t('favsTitle')}
        </m.button>
        <m.button {...tap} type="button" onClick={onOpen} data-testid="services-open"
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border-0 bg-brand px-3 font-bold text-on-brand shadow-md">
          <ListMagnifyingGlass size="1.3em" weight="bold" aria-hidden />{t('tabsLabel')}
        </m.button>
      </div>
    </div>
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
