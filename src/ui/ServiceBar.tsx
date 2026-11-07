import { Tabs } from '@base-ui/react/tabs'
import { m } from 'motion/react'
import { ListMagnifyingGlass, SlidersHorizontal } from '@phosphor-icons/react'
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
/** The Phosphor "list with star" (bold) with the star filled in, so it reads as the favourites list and not as the outline save star. */
function ListFilledStar() {
  return <svg width="1.3em" height="1.3em" viewBox="0 0 256 256" fill="currentColor" aria-hidden><path d="M28,64A12,12,0,0,1,40,52H216a12,12,0,0,1,0,24H40A12,12,0,0,1,28,64Zm12,76H88a12,12,0,0,0,0-24H40a12,12,0,0,0,0,24Zm64,40H40a12,12,0,0,0,0,24h64a12,12,0,0,0,0-24Zm135.64-33.13-20.58,17,6.25,25.26a12,12,0,0,1-17.73,13.22L184,188.46l-23.58,13.88a12,12,0,0,1-17.73-13.22l6.25-25.26-20.58-17a12,12,0,0,1,6.72-21.22l27.42-2.12L173,99.25a12,12,0,0,1,22,0l10.48,24.28,27.42,2.12a12,12,0,0,1,6.72,21.22Z" /></svg>
}

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
        {/* two Base UI tabs in a segmented control: no tab is selected on the home page, a tap turns the drawer to that page */}
        <Tabs.Root value={null} onValueChange={v => (v === 'favs' ? onFavs() : onOpen())} className="flex min-w-0 flex-1">
          <Tabs.List aria-label={t('tabsLabel')} className="flex min-w-0 flex-1 gap-1 rounded-full border border-line bg-surface p-1">
            <Tabs.Tab value="favs" render={<m.button {...tap} />} aria-label={`${t('favsTitle')}${favLayers.length ? `: ${t('favsSee').replace('{n}', String(favLayers.length))}` : ''}`} data-testid="fav-all"
              className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border-0 bg-transparent px-3 font-bold text-ink [transition:background-color_var(--dur-small)_var(--ease-out)] hover:bg-paper data-[active]:bg-paper">
              <span className="text-brand-text"><ListFilledStar /></span>{t('favsTitle')}
            </Tabs.Tab>
            <Tabs.Tab value="services" render={<m.button {...tap} />} data-testid="services-open"
              className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border-0 bg-transparent px-3 font-bold text-ink [transition:background-color_var(--dur-small)_var(--ease-out)] hover:bg-paper data-[active]:bg-paper">
              <ListMagnifyingGlass size="1.3em" weight="bold" className="text-brand-text" aria-hidden />{t('tabsLabel')}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
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
