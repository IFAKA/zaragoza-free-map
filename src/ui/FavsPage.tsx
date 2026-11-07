import { Star } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FAV_MAX, removeFav, restoreFav, useFavs } from '../lib/favs'
import { ICONS } from './icons'
import { cn } from './cn'
import { useT } from './lang'
import { MS, tap } from './motion'
import { type Fav, isLiveFav, resolveFavs, useFavLive } from './Favs'
import { PageHeader } from './Pages'
import { toasts } from './ToastHost'
import { Scroll } from './ui/kit'

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function Row({ fav, onOpen, onRemove }: { fav: Fav; onOpen: (layer: string, id: string) => void; onRemove: (key: string, keyboard: boolean) => void }) {
  const { t, lang } = useT()
  const ref = useRef<HTMLLIElement>(null)
  const [vis, setVis] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !isLiveFav(fav.item)) return
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [fav.item])
  const { text, line } = useFavLive(fav, vis)
  const I = ICONS[fav.layer.icon]
  return (
    <li ref={ref} className="fav-row flex items-center border-b border-line" data-leaving={leaving ? '' : undefined} data-testid="fav-row">
      <m.button {...tap} type="button" onClick={() => onOpen(fav.layer.id, fav.item.id)} aria-label={text ? `${fav.item.name}: ${line} ${text}` : fav.item.name}
        className="flex min-h-14 min-w-0 flex-1 select-none items-center gap-3 border-0 bg-transparent py-2 pl-4 text-left text-ink">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile text-on-brand" style={{ background: fav.layer.color }}><I size="1.4em" weight="fill" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{fav.item.name}</span>
          <span className="block truncate text-[0.82em] text-ink-soft">{fav.layer.label[lang]}</span>
        </span>
        {text && <span className="shrink-0 text-right font-bold tabular-nums text-brand-text"><span className="mr-1 text-[0.85em] font-semibold text-ink-soft">{line}</span>{text}</span>}
      </m.button>
      <m.button {...tap} type="button" aria-label={`${t('favRemove')}: ${fav.item.name}`} data-testid="fav-row-star"
        onClick={e => { if (leaving) return; if (e.detail === 0) return onRemove(fav.key, true); setLeaving(true); setTimeout(() => onRemove(fav.key, false), MS.small) }}
        className="grid size-11 shrink-0 select-none place-items-center rounded-full border-0 bg-transparent p-0 text-brand-text">
        <Star size="1.5em" weight="fill" aria-hidden />
      </m.button>
      <span className="w-1 shrink-0" aria-hidden />
    </li>
  )
}

/** The Favourites page: every saved place (most recently opened first), live minutes for bus and tram, remove with an Undo, a search from 9 places on. */
export function FavsPage({ onOpen, onBack, peekRef, locked }: { onOpen: (layer: string, id: string) => void; onBack: () => void; peekRef: (el: HTMLElement | null) => void; locked: boolean }) {
  const { t } = useT()
  const keys = useFavs()
  const all = useMemo(() => resolveFavs(keys), [keys])
  const [q, setQ] = useState('')
  const list = q.trim() && all.length > 8 ? all.filter(f => fold(f.item.name).includes(fold(q.trim()))) : all
  const remove = (key: string) => {
    const i = removeFav(key)
    if (i < 0) return
    toasts.add({ title: t('favRemoved'), timeout: 5000, data: { action: t('undo'), onAction: () => restoreFav(key, i), close: t('close') } })
  }
  return (
    <>
      <PageHeader title={`${t('favsTitle')} · ${keys.length}/${FAV_MAX}`} onBack={onBack} />
      <Scroll locked={locked}>
        <div ref={peekRef} className="w-0 min-w-full pb-6">
          {all.length > 8 && (
            <div className="px-4 pb-2">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('favsSearch')} aria-label={t('favsSearch')} data-testid="fav-search"
                className="h-11 w-full rounded-btn border-0 bg-surface px-3 text-[16px] text-ink placeholder:text-ink-soft" />
            </div>
          )}
          {!all.length ? (
            <p className="m-0 flex flex-col items-center gap-2 px-8 py-8 text-center text-ink-soft" data-testid="fav-empty">
              <Star size="2em" weight="fill" className="text-brand-text" aria-hidden />{t('favsEmpty')}
            </p>
          ) : !list.length ? (
            <p className="m-0 px-4 py-4 text-ink-soft">{t('favsNone')}</p>
          ) : (
            <ul className={cn('m-0 list-none border-t border-line p-0')} data-testid="fav-list">
              {list.map(f => <Row key={f.key} fav={f} onOpen={onOpen} onRemove={remove} />)}
            </ul>
          )}
        </div>
      </Scroll>
    </>
  )
}
