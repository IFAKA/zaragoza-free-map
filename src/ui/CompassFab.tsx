import { Compass } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { createPortal } from 'react-dom'
import { useT } from './lang'
import { tap } from './motion'

/** A compass under the support heart: on = the map position follows you while you walk (filled, brand colour); off = it stays where it was. */
export function FollowFab({ on, onToggle, inert }: { on: boolean; onToggle: () => void; inert?: boolean }) {
  const { t } = useT()
  return createPortal(
    <m.button {...tap} type="button" onClick={onToggle} aria-pressed={on} aria-label={t('follow')} title={t('follow')} data-testid="follow" inert={inert}
      className="fixed right-[max(1rem,calc(env(safe-area-inset-right)+0.25rem))] top-[calc(max(0.75rem,env(safe-area-inset-top))+44px+0.5rem+36px+0.5rem)] z-[55] inline-flex size-9 items-center justify-center rounded-full border border-line bg-paper p-0 shadow-[0_2px_10px_rgb(0_0_0/0.22)] [transition:background-color_var(--dur-press)] hov:bg-surface">
      <Compass size="1.2em" weight={on ? 'fill' : 'regular'} className={on ? 'text-brand-text' : 'text-ink-soft'} aria-hidden />
    </m.button>,
    document.body,
  )
}
