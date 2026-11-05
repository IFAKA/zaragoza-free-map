import { AnimatePresence, m } from 'motion/react'
import { Plus } from '@phosphor-icons/react'
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
 * The header of the home page: the service you are on (left, plain) and one button (right) that shows four of the other services.
 * The button turns the drawer to the Services page (same drawer, new page). `order` is the person's own order, so the four are the ones they use most.
 */
export function ServiceHeader({ layer, order, onOpen }: { layer: LayerId; order: LayerId[]; onOpen: () => void }) {
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
      <div className="flex items-center gap-3 px-4 pb-2 pt-1">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-btn text-on-brand" style={{ background: cur.color }}><m.span key={layer} {...cardSwap} className="flex"><I size="1.6em" weight="fill" aria-hidden /></m.span></span>
        <m.span key={layer + 't'} {...cardSwap} className="min-w-0 flex-1">
          <span className="block truncate font-title text-[1.15em] font-bold text-ink">{cur.label[lang]}</span>
          <span className="block truncate text-[0.88em] text-ink-soft">{cur.hint[lang]}</span>
        </m.span>
        <m.button {...tap} type="button" onClick={onOpen} aria-label={t('tabsLabel')} data-testid="services-open"
          className="relative grid size-[62px] shrink-0 grid-cols-2 grid-rows-2 place-items-center gap-0.5 rounded-[16px] border-[1.5px] border-line bg-paper p-[7px] text-ink shadow-md">
          {shown.map((id, k) => { const J = ICONS[LAYERS[id].icon]; return (
            <span key={k} className="relative grid size-full place-items-center">
              <AnimatePresence initial={false}><m.span key={id} data-layer={id} {...slotSwap} className="absolute inset-0 grid place-items-center"><J size="1.3em" weight="fill" aria-hidden /></m.span></AnimatePresence>
            </span>) })}
          <span className="grid size-full place-items-center rounded-full bg-brand text-on-brand"><Plus size="1.1em" weight="bold" aria-hidden /></span>
        </m.button>
      </div>
    </div>
  )
}

/** The Services page body: every service, in three groups, with names. The service you are on is filled. */
export function ServiceGroups({ layer, onPick }: { layer: LayerId; onPick: (id: LayerId) => void }) {
  const { lang } = useT()
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
      {GROUPS.map(g => (
        <div key={g.id}>
          <h2 className="m-0 mb-1.5 text-[0.78em] font-bold uppercase tracking-wide text-ink-soft">{g.label[lang]}</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {g.ids.map(id => {
              const J = ICONS[LAYERS[id].icon], on = id === layer
              return (
                <m.button {...tap} key={id} type="button" onClick={() => onPick(id)} aria-pressed={on} data-testid={`tab-${id}`}
                  className={'flex h-[62px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-btn border-0 text-[0.8em] font-semibold ' + (on ? 'bg-brand text-on-brand' : 'bg-surface text-ink')}>
                  <J size="1.5em" weight={on ? 'fill' : 'regular'} aria-hidden />{LAYERS[id].short[lang]}
                </m.button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
