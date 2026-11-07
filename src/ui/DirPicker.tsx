import { Button as BaseButton } from '@base-ui/react/button'
import { m } from 'motion/react'
import { cn } from './cn'
import { tap } from './motion'

export interface DirChip { id: string; label: string; /** Small second line ("north"). */ sub?: string; /** No vehicle left: greyed, cannot be chosen. */ empty?: string }

/** Two direction chips, side by side: one tap to switch. Chosen = red with white text, like the other chip rows; an empty one is grey and says why. */
export function DirPicker({ chips, value, onPick, label, testId }: { chips: DirChip[]; value: string; onPick: (id: string) => void; label: string; testId: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className={cn('mt-1 grid gap-0.5 rounded-btn bg-surface p-0.5', chips.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {chips.map(c => (
        <BaseButton
          key={c.id} onClick={() => !c.empty && onPick(c.id)} aria-pressed={value === c.id} aria-disabled={!!c.empty || undefined} data-testid="dir-chip" data-dir={c.id} data-empty={c.empty ? '' : undefined}
          render={<m.button {...(c.empty ? {} : tap)} />}
          className={cn(
            'flex min-h-8 min-w-0 select-none flex-col items-center justify-center rounded-btn border-0 px-2 py-1 text-center text-[0.87em] font-semibold leading-tight [transition:background-color_var(--dur-press)]',
            c.empty ? 'bg-transparent text-ink-soft' : value === c.id ? 'bg-brand text-on-brand' : 'bg-transparent text-ink',
          )}
        >
          <span>{c.label}</span>
          {(c.empty || c.sub) && <span className={cn('text-[0.87em] font-normal', c.empty || value !== c.id ? 'text-ink-soft' : 'text-on-brand')}>{c.empty ?? c.sub}</span>}
        </BaseButton>
      ))}
    </div>
  )
}
