import type { ReactNode } from 'react'
import { cn } from './cn'

/** Open / closed status as a small dot plus one short word, the same everywhere in the app. */
export function OpenDot({ open, children, testId, className }: { open: boolean; children: ReactNode; testId?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold', open ? 'text-success-ink' : 'text-ink-soft', className)} data-testid={testId}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', open ? 'bg-success-ink' : 'bg-line-strong')} />{children}
    </span>
  )
}
