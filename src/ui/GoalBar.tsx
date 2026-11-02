import { Tabs } from '@base-ui/react/tabs'
import { Lightning, NavigationArrow, Plugs, type Icon } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useEffect, useRef } from 'react'
import { goalById, goalOf, goalServices, type GoalId } from '../layers/goals'
import { LAYERS } from '../layers'
import type { LayerId } from '../lib/types'
import { useT } from './lang'
import { goalShift, indicator, tap } from './motion'

const GOAL_ICONS: Record<GoalId, Icon> = { now: Lightning, move: NavigationArrow, connect: Plugs }

/**
 * The tab bar: one fixed, equal column per goal (3 today), no scrolling. The order was decided when the app opened and never changes while it is open.
 * One tap on a goal opens the service last used in it. The line under the active goal slides between the columns (transform only).
 */
export function GoalTabs({ layer, order, onGoal }: { layer: LayerId; order: GoalId[]; onGoal: (id: GoalId) => void }) {
  const { lang, t } = useT()
  const goal = goalOf(layer).id
  return (
    <Tabs.Root value={goal} className="shrink-0">
      <Tabs.List className="relative grid border-b border-line" style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }} aria-label={t('tabsLabel')}>
        {order.map(id => {
          const I = GOAL_ICONS[id], label = goalById(id).label[lang]
          return (
            <Tabs.Tab
              key={id} value={id} onClick={() => onGoal(id)} data-testid={`goal-${id}`} aria-label={label} title={label}
              render={<m.button {...tap} />}
              className="group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 text-ink [transition:color_var(--dur-press)_var(--ease-out)] data-[active]:text-brand-text"
            >
              <I size="1.6em" weight={goal === id ? 'fill' : 'regular'} aria-hidden />
              <span className="max-w-full whitespace-nowrap text-[0.87em] font-semibold leading-tight">{label}</span>
            </Tabs.Tab>
          )
        })}
        <m.span aria-hidden className="pointer-events-none absolute bottom-0 left-0 flex h-0.5 justify-center" style={{ width: `${100 / order.length}%` }} initial={false} {...indicator(order.indexOf(goal))}>
          <span className="h-full w-10 rounded-full bg-brand" />
        </m.span>
      </Tabs.List>
    </Tabs.Root>
  )
}

/** The services of the active goal as equal chips (max 4, no scrolling). Hidden when the goal has one service. Changing goal moves the row 8 px toward the new goal and fades it in. */
export function ServiceChips({ layer, order, onService }: { layer: LayerId; order: GoalId[]; onService: (id: LayerId) => void }) {
  const { lang } = useT()
  const goal = goalOf(layer)
  const prev = useRef(goal.id)
  const dir = Math.sign(order.indexOf(goal.id) - order.indexOf(prev.current))
  useEffect(() => { prev.current = goal.id }, [goal.id])
  const list = goalServices(goal)
  if (list.length < 2) return null
  const anim = dir === 0 ? { initial: false as const, animate: { opacity: 1, x: 0 } } : goalShift(dir)
  return (
    <m.div key={goal.id} {...anim} className="shrink-0 px-3 pb-1 pt-2" data-testid="services" data-goal={goal.id}>
      <Tabs.Root value={layer}>
        <Tabs.List className="grid gap-2" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }} aria-label={goal.label[lang]}>
          {list.map(id => (
            <Tabs.Tab
              key={id} value={id} onClick={() => onService(id)} data-testid={`tab-${id}`} aria-label={LAYERS[id].label[lang]} title={LAYERS[id].label[lang]}
              render={<m.button {...tap} />}
              className="min-h-[44px] min-w-0 select-none whitespace-nowrap rounded-btn border-0 bg-surface px-1 text-[0.93em] font-semibold text-ink [transition:background-color_var(--dur-press),color_var(--dur-press)] data-[active]:bg-brand data-[active]:text-on-brand"
            >{LAYERS[id].short[lang]}</Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
    </m.div>
  )
}
