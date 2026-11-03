import { Tabs } from '@base-ui/react/tabs'
import { m } from 'motion/react'
import { useEffect, useRef } from 'react'
import { LAYERS } from '../layers'
import type { LayerId } from '../lib/types'
import { useT } from './lang'
import { ICONS } from './icons'
import { tap } from './motion'

/**
 * The one row of service chips (icon + short name), scrolling sideways. The order was decided when the app opened and never changes while it is open.
 * A chip is 40 px tall; its tap area grows to 48 px (the row's own padding) and 8 px sideways (the gap). The chip you are on is scrolled into view; the row itself never animates.
 */
export function ServiceChips({ layer, order, onService }: { layer: LayerId; order: LayerId[]; onService: (id: LayerId) => void }) {
  const { lang, t } = useT()
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[data-active]')
    if (!el || !list.current) return
    const row = list.current.getBoundingClientRect(), r = el.getBoundingClientRect()
    if (r.left < row.left || r.right > row.right) list.current.scrollLeft += r.left + r.width / 2 - (row.left + row.width / 2)
  }, [layer])
  return (
    <Tabs.Root value={layer} className="shrink-0">
      <Tabs.List ref={list} className="no-scrollbar flex gap-2 overflow-x-auto overflow-y-hidden px-3 py-1" aria-label={t('tabsLabel')} data-testid="services">
        {order.map(id => {
          const I = ICONS[LAYERS[id].icon], label = LAYERS[id].label[lang]
          return (
            <Tabs.Tab
              key={id} value={id} onClick={() => onService(id)} data-testid={`tab-${id}`} aria-label={label} title={label}
              render={<m.button {...tap} />}
              className="relative flex h-10 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-btn border-0 bg-surface px-3 text-[0.93em] font-semibold text-ink before:absolute before:-inset-x-1 before:-inset-y-1 before:content-[''] [transition:background-color_var(--dur-press),color_var(--dur-press)] data-[active]:bg-brand data-[active]:text-on-brand"
            >
              <I size="1.25em" weight={layer === id ? 'fill' : 'regular'} aria-hidden />
              {LAYERS[id].short[lang]}
            </Tabs.Tab>
          )
        })}
      </Tabs.List>
    </Tabs.Root>
  )
}
