import { cn } from './cn'

/** A grey placeholder block for text that is still loading. `className` sets its size. Hidden from screen readers: put an sr-only message next to it. */
export function Skel({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skel', className)} />
}

/** Rows that look like arrival rows (line badge, name, time) while the live times load. */
export function SkelRows({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-11 items-center gap-2"><Skel className="h-6 w-10" /><Skel className="h-4 flex-1" /><Skel className="h-4 w-14" /></div>
      ))}
    </div>
  )
}
