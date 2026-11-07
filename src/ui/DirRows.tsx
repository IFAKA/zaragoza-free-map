import type { ReactNode } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { m } from 'motion/react'
import { cn } from './cn'
import { tap } from './motion'

export interface DirChip {
  id: string; label: string
  /** Line badge shown before the destination (tram "L1"). */ badge?: ReactNode
  /** Small second line under the destination ("in 8 min"). */ sub?: ReactNode
  /** The next times of this direction, right side. */ times: ReactNode
  /** No vehicle left: greyed, cannot be chosen. */ empty?: boolean
}

/** The two directions of a tram stop or a station as two rows, like the bus rows: where it goes on the left, when on the right. The chosen one is filled (it also decides which vehicles the map shows); an empty one is grey. */
export function DirRows({ chips, value, onPick, label, testId }: { chips: DirChip[]; value: string; onPick: (id: string) => void; label: string; testId: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className="mt-1 flex flex-col divide-y divide-line">
      {chips.map(c => {
        const on = value === c.id && !c.empty
        return (
          <BaseButton
            key={c.id} onClick={() => !c.empty && onPick(c.id)} aria-pressed={on} aria-disabled={c.empty || undefined} data-testid="dir-chip" data-dir={c.id} data-empty={c.empty ? '' : undefined}
            render={<m.button {...(c.empty ? {} : tap)} />}
            className={cn('flex min-h-11 w-full select-none items-center gap-2 border-0 bg-transparent px-0 py-1.5 text-left leading-tight', c.empty ? 'text-ink-soft' : 'text-ink')}
          >
            <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full border-2', c.empty ? 'border-line-strong' : 'border-brand', on ? 'bg-brand' : 'bg-paper')} />
            {c.badge}
            <span className="min-w-0 flex-1"><span className={cn('block truncate', on && 'font-bold')}>{c.label}</span>{c.sub && <span className="block truncate text-[0.87em] font-normal text-ink-soft">{c.sub}</span>}</span>
            <span className={cn('shrink-0 tabular-nums', on ? 'font-extrabold' : 'font-bold', c.empty && 'font-normal')}>{c.times}</span>
          </BaseButton>
        )
      })}
    </div>
  )
}
