import { Popover } from '@base-ui/react/popover'
import { Heart } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBackLayer } from './back'
import { useT } from './lang'
import { tap } from './motion'

/**
 * A quiet support heart under the Settings button: grey, smaller, no badge. A tap opens a small card that says what it is
 * (free, no ads) with one Ko-fi button, so nobody is sent to an outside site by surprise.
 */
export function SupportFab({ inert }: { inert?: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  useBackLayer(open, () => setOpen(false))
  return createPortal(
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<m.button {...tap} />} aria-label={t('support')} title={t('support')} data-testid="open-support" inert={inert}
        className="fixed right-[max(1rem,calc(env(safe-area-inset-right)+0.25rem))] top-[calc(max(0.75rem,env(safe-area-inset-top))+44px+0.5rem)] z-[55] inline-flex size-9 items-center justify-center rounded-full border border-line bg-paper p-0 text-ink-soft shadow-[0_2px_10px_rgb(0_0_0/0.22)] [transition:background-color_var(--dur-press)] hov:bg-surface">
        <Heart size="1.2em" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-[60]">
          <Popover.Popup data-testid="support-card" className="max-w-64 rounded-card border border-line bg-paper p-3 text-[0.93em] text-ink shadow-[0_4px_16px_rgb(0_0_0/0.2)] origin-(--transform-origin) outline-none [transition:opacity_var(--dur-small)_var(--ease-out)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <p className="m-0 mb-3">{t('supportAsk')}</p>
            <m.button {...tap} type="button" onClick={() => { window.open('https://ko-fi.com/zfaka', '_blank', 'noopener'); setOpen(false) }} data-testid="support-kofi"
              className="min-h-11 w-full rounded-btn border-0 bg-brand px-4 font-bold text-on-brand">{t('support')}</m.button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>,
    document.body,
  )
}
