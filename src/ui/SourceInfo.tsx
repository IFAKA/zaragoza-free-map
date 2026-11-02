import { Popover } from '@base-ui/react/popover'
import type { Item } from '../lib/types'
import { srcExplain } from './labels'
import { press } from './cls'
import { useT } from './lang'

/** Small "i" button; opens on tap (touch) or hover (mouse) and explains where the data comes from. */
export function SourceInfo({ item, text }: { item: Item; text: string }) {
  const { t } = useT()
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        aria-label={t('srcInfo')}
        className={`${press} inline-flex h-11 w-11 items-center justify-center rounded-full text-mut hov:text-fg`}
      >
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-bold">i</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={10} className="z-[1000]">
          <Popover.Popup className="max-w-[260px] origin-[var(--transform-origin)] rounded-xl border border-line bg-bg px-3 py-2.5 text-[13px] leading-snug text-fg shadow-lg transition-[opacity,transform] duration-150 ease-snap data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:transition-none motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[ending-style]:scale-100">
            <Popover.Title className="text-[13px] font-semibold">{text}</Popover.Title>
            <Popover.Description className="mt-1 text-mut">{srcExplain(t, item)}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
