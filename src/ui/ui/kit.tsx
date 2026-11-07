// Small wrappers over Base UI parts, styled with the design tokens. Nothing here knows about the app.
import { Button as BaseButton } from '@base-ui/react/button'
import { Popover } from '@base-ui/react/popover'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { CaretDown, Check, Info } from '@phosphor-icons/react'
import { m } from 'motion/react'
import { useState, type ComponentProps, type ReactNode } from 'react'
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

const FILTER = 'inline-flex h-8 shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-btn border-0 px-3 text-[0.87em] font-semibold [transition:background-color_var(--dur-press)] '
const filterTone = (on: boolean) => (on ? 'bg-brand text-on-brand' : 'bg-surface text-ink')

/** A filter that is on or off: one compact chip, red when on. */
export function FilterChip({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return <m.button {...tap} type="button" aria-pressed={on} onClick={() => onChange(!on)} data-testid={testId} className={FILTER + filterTone(on)}>{label}</m.button>
}

/** A filter with several options: a chip with an arrow that opens the list. Red when something other than the default is chosen. */
export function FilterMenu({ value, onChange, options, label, allValue = 'all', neutral = true, testId }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; allValue?: string; neutral?: boolean; testId?: string }) {
  const on = neutral && value !== allValue
  const shown = !neutral || on ? options.find(o => o.value === value)?.label ?? label : label
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<m.button {...tap} />} data-testid={testId} aria-label={label} className={FILTER + filterTone(on)}>
        {neutral ? shown : options.find(o => o.value === value)?.label ?? label}
        <CaretDown size="1em" weight="bold" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-[60]">
          <Popover.Popup className="min-w-40 rounded-card border border-line bg-paper py-1 text-[0.93em] text-ink shadow-[0_4px_16px_rgb(0_0_0/0.2)] origin-(--transform-origin) outline-none [transition:opacity_var(--dur-small)_var(--ease-out)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <div role="radiogroup" aria-label={label}>
              {options.map(o => (
                <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => { onChange(o.value); setOpen(false) }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 border-0 bg-transparent px-3 text-left font-semibold text-ink hov:bg-surface">
                  {o.label}{o.value === value && <Check size="1.1em" weight="bold" className="text-brand-text" aria-hidden />}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
