import { Popover } from '@base-ui/react/popover'
import { DotsThreeVertical, PencilSimple, Star, Trash } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { type FavKind, favTitle, filterKind, isStopLayer, nearestFavs, removeFav, restoreFav, setLabel, LABEL_MAX, useFavLabels, useFavs } from '../lib/favs'
import type { LatLon } from '../lib/types'
import { useT } from './lang'
import { tap } from './motion'
import { type Fav, FavRow, resolveFavs, useSteadyPos } from './Favs'
import { PageHeader } from './Pages'
import { toasts } from './ToastHost'
import { FilterMenu, Scroll } from './ui/kit'

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
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null)
  const [menu, setMenu] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [renameKey, setRenameKey] = useState<string | null>(null)
  const renaming = renameKey ? all.find(f => f.key === renameKey) : undefined
  const both = all.some(f => isStopLayer(f.layer.id)) && all.some(f => !isStopLayer(f.layer.id))
  const byKind = filterKind(all, both ? kind : 'all')
  const needle = fold(q.trim())
  const list = needle && all.length > 8 ? byKind.filter(f => fold(favTitle(f.item.name, labels[f.key]) + ' ' + f.item.name).includes(needle)) : byKind
  const ticked = picked.filter(k => all.some(f => f.key === k))
  const allOn = list.length > 0 && list.every(f => ticked.includes(f.key))
  const toggle = (key: string) => setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]))
  const done = () => { setMode(null); setPicked([]) }
  const removePicked = () => {
    const gone = ticked.map(k => [k, removeFav(k)] as const).filter(([, i]) => i >= 0)
    if (!gone.length) return
    done()
    toasts.add({ title: t('favRemoved'), timeout: 5000, data: { action: t('undo'), onAction: () => [...gone].reverse().forEach(([k, i]) => restoreFav(k, i)), close: '' } })
  }
  const start = (k: 'edit' | 'delete') => { setMenu(false); setPicked([]); setMode(k) }
  const item = 'flex min-h-[44px] w-full items-center gap-3 border-0 bg-transparent px-3 text-left font-semibold text-ink hov:bg-surface'
  const action = all.length > 0 && (mode ? (
    <m.button {...tap} type="button" onClick={done} data-testid="fav-edit"
      className="ml-auto mr-1 inline-flex min-h-[44px] select-none items-center border-0 bg-transparent px-3 font-semibold text-brand-text">{t('favsDone')}</m.button>
  ) : (
    <Popover.Root open={menu} onOpenChange={setMenu}>
      <Popover.Trigger render={<m.button {...tap} />} aria-label={t('favsMore')} data-testid="fav-more"
        className="ml-auto mr-1 inline-flex size-11 select-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-brand-text"><DotsThreeVertical size="1.5em" weight="bold" aria-hidden /></Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-[60]">
          <Popover.Popup className="min-w-40 rounded-card border border-line bg-paper py-1 text-[0.93em] text-ink shadow-[0_4px_16px_rgb(0_0_0/0.2)] origin-(--transform-origin) outline-none [transition:opacity_var(--dur-small)_var(--ease-out)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <button type="button" onClick={() => start('edit')} data-testid="fav-menu-edit" className={item}><PencilSimple size="1.2em" aria-hidden />{t('favsEdit')}</button>
            <button type="button" onClick={() => start('delete')} data-testid="fav-menu-delete" className={item}><Trash size="1.2em" aria-hidden />{t('favsDelete')}</button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  ))
  if (renaming) return <RenameView fav={renaming} label={labels[renaming.key]} onBack={() => setRenameKey(null)} locked={locked} peekRef={peekRef} />
  return (
    <>
      <PageHeader title={`${t('favsTitle')} · ${all.length}`} onBack={onBack} action={action} />
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
              <FilterMenu value={kind} onChange={v => setKind(v as FavKind)} label={t('favsKinds')} options={[{ value: 'all', label: t('favsKindAll') }, { value: 'stops', label: t('favsStops') }, { value: 'places', label: t('favsPlaces') }]} />
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
              {list.map(f => <FavRow key={f.key} fav={f} pos={steady} onOpen={onOpen} mode={mode ?? undefined} checked={ticked.includes(f.key)} onToggle={toggle} onRename={setRenameKey} full />)}
            </ul>
          )}
        </div>
      </Scroll>
      {mode === 'delete' && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-2" data-testid="fav-delete-bar">
          <m.button {...tap} type="button" onClick={() => setPicked(allOn ? [] : list.map(f => f.key))} data-testid="fav-select-all"
            className="min-h-11 rounded-btn border-0 bg-surface px-4 font-bold text-ink">{allOn ? t('favsNoneSel') : t('favsAll')}</m.button>
          <m.button {...tap} type="button" disabled={!ticked.length} onClick={removePicked} data-testid="fav-delete-go"
            className="ml-auto min-h-11 rounded-btn border-0 bg-brand px-4 font-bold text-on-brand disabled:opacity-40">{t('favsDeleteN').replace('{n}', String(ticked.length))}</m.button>
        </div>
      )}
    </>
  )
}

/** The rename view: a page of its own (back returns to the list). One field, two one-tap names for the stops most people save (home, work), and Save. An empty field gives back the real name. */
function RenameView({ fav, label, onBack, locked, peekRef }: { fav: Fav; label?: string; onBack: () => void; locked: boolean; peekRef: (el: HTMLElement | null) => void }) {
  const { t, lang, type } = useT()
  const ref = useRef<HTMLInputElement>(null)
  const name = fav.item.name || type(fav.item.type)
  const save = (v: string) => { setLabel(fav.key, v); onBack() }
  return (
    <>
      <PageHeader title={t('favRename')} onBack={onBack} />
      <Scroll locked={locked}>
        <form ref={peekRef as React.Ref<HTMLFormElement>} className="flex w-0 min-w-full flex-col gap-3 px-4 pb-6" onSubmit={e => { e.preventDefault(); save(ref.current?.value ?? '') }}>
          <p className="m-0 text-ink-soft">{name} · {fav.layer.label[lang]}</p>
          <input ref={ref} autoFocus defaultValue={label ?? ''} maxLength={LABEL_MAX} placeholder={name} aria-label={t('favRename')} data-testid="fav-rename" enterKeyHint="done"
            onFocus={e => e.currentTarget.select()}
            className="block h-11 w-full min-w-0 rounded-btn border border-line-strong bg-paper px-3 text-[16px] font-bold text-ink placeholder:font-normal placeholder:text-ink-soft" />
          <div className="flex gap-2" data-testid="fav-presets">
            {([['favHome', 'fav-preset-home'], ['favWork', 'fav-preset-work']] as const).map(([k, id]) => (
              <m.button {...tap} key={k} type="button" data-testid={id} onClick={() => save(t(k))}
                className="min-h-11 rounded-btn border-0 bg-surface px-4 font-bold text-ink">{t(k)}</m.button>
            ))}
          </div>
          <m.button {...tap} type="submit" data-testid="fav-rename-save" className="min-h-11 rounded-btn border-0 bg-brand px-4 font-bold text-on-brand">{t('favSave')}</m.button>
        </form>
      </Scroll>
    </>
  )
}
