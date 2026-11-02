import { Button as BaseButton } from '@base-ui/react/button'
import { GearSix } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { createPortal } from 'react-dom'
import { tap } from './motion'

/**
 * The Settings button: a round 44 px button floating at the top right of the screen, over the map. It is fixed, so it never moves with the sheet.
 * Drawn in the page body (not inside the app box) so it stays above the sheet (z-50) when the sheet is full, and below the toasts (z-70).
 * On desktop the side panel is on the left, so the top right corner is the map side too.
 */
export function SettingsFab({ onClick, label, inert }: { onClick: () => void; label: string; inert?: boolean }) {
  return createPortal(
    <BaseButton
      onClick={onClick} render={<m.button {...tap} />} aria-label={label} title={label} data-testid="open-settings" inert={inert}
      className="fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[55] inline-flex size-[44px] items-center justify-center rounded-full border border-line bg-paper p-0 text-brand-text shadow-[0_2px_10px_rgb(0_0_0/0.22)] [transition:background-color_var(--dur-press)] hov:bg-surface"
    >
      <GearSix size="1.5em" aria-hidden />
    </BaseButton>,
    document.body,
  )
}
