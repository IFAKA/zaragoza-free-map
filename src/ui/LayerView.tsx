import { Button } from '@base-ui/react/button'
import { Switch } from '@base-ui/react/switch'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import type { LayerRuntime } from '../layer-data'
import { nearestOf } from '../lib/rank'
import type { RankedItem } from '../lib/types'
import { press } from './cls'
import { useT } from './lang'
import { ListCard, PinCard } from './ItemCard'
import type { DragProps } from './useSheet'

export interface LayerState {
  rt: LayerRuntime
  arr: RankedItem[]
  selected: string | null
  openOnly: boolean
  cat: string | null
  locating: boolean
  hasPos: boolean
  note: string
}

const chipCls = `${press} inline-flex min-h-11 flex-none items-center rounded-full border border-line bg-chip px-3.5 text-sm text-fg hov:border-pri`

export function LayerHead({ s, dz, onBack, onOpenOnly, onCat, onRetry, onWalk }: {
  s: LayerState; dz: DragProps; onBack: () => void; onOpenOnly: (v: boolean) => void; onCat: (c: string | null) => void; onRetry: () => void; onWalk: () => void
}) {
  const { t, lang } = useT()
  const { rt, arr } = s
  const cfg = rt.cfg
  const live = (it: RankedItem) => !!rt.parts[it.part]?.live
  const near = nearestOf(cfg, arr, !!rt.parts.city?.live)
  const shown = (s.selected && arr.find(x => x.id === s.selected)) || near
  const states = cfg.parts.map(p => rt.parts[p.k]!.state)
  const statusTxt = cfg.parts.map(p => {
    const d = rt.parts[p.k]!
    const name = p.k === 'osm' ? t('srcOsm') : p.k === 'tgo' ? t('srcTgo') : t('srcCity')
    return `${name}: ${d.state === 'load' ? t('stLoad') : d.state === 'fail' ? t('stFail') : d.live ? t('stLive') : t('stSaved')}`
  }).join(' · ')
  const msg = 'rounded-2xl border border-dashed border-line p-3.5 text-sm leading-snug text-mut'
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Button onClick={onBack} className={`${press} -ml-2 min-h-11 flex-none rounded-lg px-3 text-[15px] font-semibold text-pri`}><span aria-hidden>‹ </span>{t('back')}</Button>
        {(cfg.hours || cfg.cats) && (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none]">
            {cfg.hours && (
              <label className={`${chipCls} cursor-pointer gap-2 has-[[data-checked]]:border-pri has-[[data-checked]]:bg-pri has-[[data-checked]]:font-semibold has-[[data-checked]]:text-onpri`}>
                <Switch.Root
                  checked={s.openOnly}
                  onCheckedChange={onOpenOnly}
                  className="relative h-5 w-9 flex-none rounded-full bg-mut/50 p-0.5 outline-offset-2 data-[checked]:bg-onpri/40"
                >
                  <Switch.Thumb className="block h-4 w-4 rounded-full bg-white transition-transform duration-[120ms] ease-snap data-[checked]:translate-x-4 motion-reduce:transition-none" />
                </Switch.Root>
                {t('openNow')}
              </label>
            )}
            {cfg.cats && (
              <ToggleGroup value={s.cat ? [s.cat] : []} onValueChange={v => onCat(v[0] ?? null)} aria-label={cfg.label[lang]} className="flex gap-2">
                {cfg.cats.map(c => (
                  <Toggle key={c} value={c} className={`${chipCls} data-[pressed]:border-pri data-[pressed]:bg-pri data-[pressed]:font-semibold data-[pressed]:text-onpri`}>{t(c as 'muni')}</Toggle>
                ))}
              </ToggleGroup>
            )}
          </div>
        )}
      </div>
      <div className="mt-1">
        {s.locating ? <div className={msg}>{t('finding')}</div>
          : shown ? <PinCard layer={cfg} item={shown} live={live(shown)} tag={shown === near ? t(cfg.nearKey || 'nearest') : t('selected')} onWalk={onWalk} />
          : states.some(x => x === 'load') ? <div className={msg}>{t('loading')}</div>
          : states.every(x => x === 'fail') ? (
            <div className={msg}>{t('failed')}
              <Button onClick={onRetry} className={`${press} mt-2 block min-h-11 rounded-xl border border-pri px-4 font-semibold text-pri`}>{t('retry')}</Button>
            </div>)
          : <div className={msg}>{cfg.hours && s.openOnly ? t('noneOpen') : t('none')}</div>}
      </div>
      <div className="mt-1.5 touch-none text-[12.5px] leading-snug text-mut" {...dz}>
        <b>{arr.length}</b> {t('places')} · {s.note || (s.hasPos ? t('fromYou') : t('fromCentre'))}<br />{statusTxt}
      </div>
    </div>
  )
}

export function LayerList({ s, limit, onMore, onSelect, onWalk }: { s: LayerState; limit: number; onMore: () => void; onSelect: (id: string) => void; onWalk: () => void }) {
  const { t } = useT()
  const { rt, arr } = s
  return (
    <>
      {arr.slice(0, limit).map(it => (
        <ListCard key={it.id} layer={rt.cfg} item={it} live={!!rt.parts[it.part]?.live} selected={it.id === s.selected} onSelect={() => onSelect(it.id)} onWalk={onWalk} />
      ))}
      {arr.length > limit && (
        <li><Button onClick={onMore} className={`${press} mx-auto my-3 block min-h-11 rounded-xl border border-line bg-chip px-5 text-sm`}>{t('showMore')}</Button></li>
      )}
    </>
  )
}
