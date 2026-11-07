import { Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useMemo, useState } from 'react'
import { type FavKind, favTitle, filterKind, isStopLayer, nearestFavs, removeFav, restoreFav, useFavLabels, useFavs } from '../lib/favs'
import type { LatLon } from '../lib/types'
import { useT } from './lang'
import { tap } from './motion'
import { FavRow, resolveFavs, useSteadyPos } from './Favs'
import { PageHeader } from './Pages'
import { toasts } from './ToastHost'
import { Chips, Scroll } from './ui/kit'

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** The Favourites page: every saved place, nearest first (the order they were opened in when the position is unknown), live times for bus and tram, a Stops / Places filter, a search from 9 places on, and an Edit mode to remove (with an Undo) or rename. */
export function FavsPage({ onOpen, onBack, peekRef, locked, pos }: { onOpen: (layer: string, id: string) => void; onBack: () => void; peekRef: (el: HTMLElement | null) => void; locked: boolean; pos: LatLon | null }) {
  const { t } = useT()
  const keys = useFavs()
  const labels = useFavLabels()
  const steady = useSteadyPos(pos)
  const all = useMemo(() => nearestFavs(resolveFavs(keys), steady, keys.length), [keys, steady])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<FavKind>('all')
  const [edit, setEdit] = useState(false)
  const both = all.some(f => isStopLayer(f.layer.id)) && all.some(f => !isStopLayer(f.layer.id))
  const byKind = filterKind(all, both ? kind : 'all')
  const needle = fold(q.trim())
  const list = needle && all.length > 8 ? byKind.filter(f => fold(favTitle(f.item.name, labels[f.key]) + ' ' + f.item.name).includes(needle)) : byKind
  const remove = (key: string) => {
    const i = removeFav(key)
    if (i < 0) return
    toasts.add({ title: t('favRemoved'), timeout: 5000, data: { action: t('undo'), onAction: () => restoreFav(key, i), close: '', top: true } })
  }
  const editBtn = all.length > 0 && (
    <m.button {...tap} type="button" onClick={() => setEdit(e => !e)} aria-pressed={edit} data-testid="fav-edit"
      className="ml-auto mr-1 inline-flex min-h-[44px] select-none items-center border-0 bg-transparent px-3 font-semibold text-brand-text">{edit ? t('favsDone') : t('favsEdit')}</m.button>
  )
  return (
    <>
      <PageHeader title={`${t('favsTitle')} · ${all.length}`} onBack={onBack} action={editBtn} />
      <Scroll locked={locked}>
        <div ref={peekRef} className="w-0 min-w-full pb-6">
          {all.length > 8 && (
            <div className="px-4 pb-2">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('favsSearch')} aria-label={t('favsSearch')} data-testid="fav-search"
                className="h-11 w-full rounded-btn border-0 bg-surface px-3 text-[16px] text-ink placeholder:text-ink-soft" />
            </div>
          )}
          {both && (
            <div className="px-4 pb-2" data-testid="fav-kinds">
              <Chips value={kind} onChange={v => setKind(v as FavKind)} label={t('favsKinds')} options={[{ value: 'all', label: t('favsKindAll') }, { value: 'stops', label: t('favsStops') }, { value: 'places', label: t('favsPlaces') }]} />
            </div>
          )}
          {!all.length ? (
            <p className="m-0 flex flex-col items-center gap-2 px-8 py-8 text-center text-ink-soft" data-testid="fav-empty">
              <Star size="2em" weight="fill" className="text-brand-text" aria-hidden />{t('favsEmpty')}
            </p>
          ) : !list.length ? (
            <p className="m-0 px-4 py-4 text-ink-soft">{t('favsNone')}</p>
          ) : (
            <ul className="m-0 list-none border-t border-line p-0" data-testid="fav-list">
              {list.map(f => <FavRow key={f.key} fav={f} pos={steady} onOpen={onOpen} edit={edit} onRemove={remove} full />)}
            </ul>
          )}
        </div>
      </Scroll>
    </>
  )
}
