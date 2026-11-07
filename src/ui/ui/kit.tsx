// Small wrappers over Base UI parts, styled with the design tokens. Nothing here knows about the app.
import { Button as BaseButton } from '@base-ui/react/button'
import { Popover } from '@base-ui/react/popover'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Info } from '@phosphor-icons/react'
import { m } from 'motion/react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../cn'
import { tap } from '../motion'
import { useSheetClosed } from '../sheet'

type Variant = 'primary' | 'secondary' | 'link'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hov:bg-brand-pressed active:bg-brand-pressed',
  secondary: 'border border-line-strong bg-transparent text-brand-text hov:bg-surface active:bg-surface',
  link: 'bg-transparent px-1 text-brand-text underline-offset-2 hov:underline',
}
const BTN = 'inline-flex min-h-[44px] select-none items-center justify-center gap-2 rounded-btn px-4 text-center font-semibold no-underline [transition:background-color_var(--dur-press)] disabled:opacity-50'
/** Primary = solid red. Secondary = grey border, red text (always next to a primary). Link = text only. */
export function Button({ variant = 'primary', className, ...p }: ComponentProps<typeof BaseButton> & { variant?: Variant }) {
  const link = 'render' in p && !!p.render
  return <BaseButton render={<m.button {...tap} />} className={cn(BTN, VARIANT[variant], className as string)} {...p} {...(link ? { role: 'link' } : {})} />
}
/** A Button that is really a link (opens a page): use `render` with an <a>. */
export const linkProps = (href: string) => ({ render: <m.a {...tap} href={href} target="_blank" rel="noopener" />, nativeButton: false as const })

/** Labelled switch: red when on, light grey when off. */
export function Switch({ checked, onCheckedChange, label, hint, testId }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; hint?: string; testId?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1">
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-tight">{label}</span>
        {hint && <span className="block text-[0.87em] leading-tight text-ink-soft">{hint}</span>}
      </span>
      <BaseSwitch.Root render={<m.button {...tap} />} nativeButton
        checked={checked} onCheckedChange={onCheckedChange} data-testid={testId}
        className="relative inline-flex h-[1.6em] w-[2.8em] shrink-0 items-center rounded-full border border-line-strong bg-surface p-[0.15em] [transition:background-color_var(--dur-small),border-color_var(--dur-small)] data-[checked]:border-brand data-[checked]:bg-brand"
      >
        <BaseSwitch.Thumb className="block size-[1.1em] rounded-full bg-line-strong [transition:translate_var(--dur-small)_var(--ease-out),background-color_var(--dur-small)] data-[checked]:translate-x-[1.2em] data-[checked]:bg-on-brand" />
      </BaseSwitch.Root>
    </label>
  )
}

/** One-of chips: selected = red with white text, unselected = light grey. Pressing the selected chip clears to `allValue`. */
export function Chips({ value, onChange, options, label, allValue = 'all' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; allValue?: string }) {
  return (
    <ToggleGroup value={[value]} onValueChange={v => onChange(v[0] ?? allValue)} aria-label={label} className="flex flex-wrap gap-2">
      {options.map(o => (
        <Toggle
          key={o.value} value={o.value} render={<m.button {...tap} />}
          className="min-h-[44px] select-none rounded-btn bg-surface px-3.5 text-[0.93em] font-semibold text-ink [transition:background-color_var(--dur-press)] data-[pressed]:bg-brand data-[pressed]:text-on-brand"
        >{o.label}</Toggle>
      ))}
    </ToggleGroup>
  )
}

export function Separator({ className }: { className?: string }) {
  return <BaseSeparator className={cn('h-px w-full bg-line', className)} />
}

/** Vertical scroll area. `locked` = no scrolling (the drawer is not fully open, so a drag moves the drawer instead). */
export function Scroll({ children, locked, className, viewportRef }: { children: ReactNode; locked?: boolean; className?: string; viewportRef?: React.Ref<HTMLDivElement> }) {
  const closed = useSheetClosed()
  return (
    <ScrollArea.Root className={cn('relative min-h-0 flex-1', className)} inert={closed}>
      <ScrollArea.Viewport ref={viewportRef} className={cn('h-full overscroll-contain', locked && 'overflow-y-hidden!')} data-testid="scroll">
        <ScrollArea.Content>{children}</ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="m-0.5 flex w-1.5 justify-center opacity-0 [transition:opacity_var(--dur-small)] data-[hovering]:opacity-100 data-[scrolling]:opacity-100">
        <ScrollArea.Thumb className="w-full rounded-full bg-handle" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}

/** Small "i" button that opens an explanation. */
export function InfoPop({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger render={<m.button {...tap} />} aria-label={label} className="inline-flex size-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-info">
        <Info size="1.25em" weight="bold" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-[60]">
          <Popover.Popup className="max-w-[min(20em,calc(100vw-2em))] rounded-card border border-line bg-paper p-3 text-[0.93em] leading-snug text-ink shadow-[0_4px_16px_rgb(0_0_0/0.2)] origin-(--transform-origin) outline-none [transition:opacity_var(--dur-small)_var(--ease-out),scale_var(--dur-small)_var(--ease-out)] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:[transition-duration:var(--dur-press)]">
            {title && <Popover.Title className="mb-1 text-[1em] font-extrabold">{title}</Popover.Title>}
            <Popover.Description className="m-0">{children}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
