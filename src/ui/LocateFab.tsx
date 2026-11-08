import { Crosshair } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { createPortal } from 'react-dom'
import { useT } from './lang'
import { tap } from './motion'

/** Under the compass: flies the map back to you after you moved it away. Without a position yet, it asks for it. */
export function LocateFab({ onTap, inert }: { onTap: () => void; inert?: boolean }) {
  const { t } = useT()
  return createPortal(
    <m.button {...tap} type="button" onClick={onTap} aria-label={t('locateMe')} title={t('locateMe')} data-testid="locate-fab" inert={inert}
      className="fixed right-[max(1rem,calc(env(safe-area-inset-right)+0.25rem))] top-[calc(max(0.75rem,env(safe-area-inset-top))+44px+0.5rem+36px+0.5rem+36px+0.5rem)] z-[55] inline-flex size-9 items-center justify-center rounded-full border border-line bg-paper p-0 shadow-[0_2px_10px_rgb(0_0_0/0.22)] [transition:background-color_var(--dur-press)] hov:bg-surface">
      <Crosshair size="1.2em" className="text-ink-soft" aria-hidden />
    </m.button>,
    document.body,
  )
}
