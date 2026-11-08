import { Button as BaseButton } from '@base-ui/react/button'
import { m } from 'motion/react'
import { ICONS } from './icons'
import { OpenDot } from './OpenDot'
import { useT } from './lang'
import { cn } from './cn'
import { tap } from './motion'
import { walkMins } from '../lib/geo'
import type { LayerConfig, RankedItem } from '../lib/types'

/** Desktop home only: the closest places of the chosen service under the card, so the wide panel is not empty. Same items and distances as the card (arr is sorted by distance). */
export function NearestList({ layer, items, selected, onPick }: { layer: LayerConfig; items: RankedItem[]; selected: string | null; onPick: (id: string) => void }) {
  const { t, type } = useT()
  const rows = items.slice(0, 6)
  if (!rows.length) return null
  const Icon = ICONS[layer.icon]
  // w-0 min-w-full: the scroll area sizes itself to its widest content, so a long name must not widen it
  return (
    <section aria-label={t('nearList')} data-testid="near-list" className="w-0 min-w-full">
      <h2 className="m-0 px-4 pb-1 pt-3 text-[0.8em] font-semibold uppercase tracking-wide text-ink-soft">{t('nearList')}</h2>
      {rows.map(it => {
        const open = !layer.hours ? null : it.always || it.open === true ? true : it.open === false ? false : null
        return (
          <BaseButton key={it.id} onClick={() => onPick(it.id)} data-testid="near-row" aria-current={it.id === selected || undefined} render={<m.button {...tap} />}
            className={cn('flex min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-transparent px-4 py-2 text-left text-ink focus-visible:-outline-offset-2 [transition:background-color_var(--dur-press)] hov:bg-surface', it.id === selected && 'bg-brand-tint')}>
            <Icon size="1.3em" weight="fill" style={{ color: layer.color }} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{it.name || type(it.type)}</span>
              <span className="block text-[0.93em] leading-snug text-ink-soft">{walkMins(it.d)} {t('minWalk')}</span>
            </span>
            {open !== null && <OpenDot open={open}>{it.always ? t('alwaysOn') : open ? t('openShort') : t('closedShort')}</OpenDot>}
          </BaseButton>
        )
      })}
    </section>
  )
}
