import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Drawer, DrawerContent } from './ui/drawer'

/**
 * Pages inside ONE drawer (same mechanics as the suitkeep menu): a submenu is a page, not a second drawer.
 * - pages form a real stack: `go` pushes, `goUp` pops, so Back returns to the page you came from;
 * - a new page fades in over 300ms (keyed by turn.key);
 * - the drawer eases to the height the new page needs (snap point change, 450ms) instead of jumping.
 */
export interface Turn { key: string }
export function usePages<P extends string>(first: P) {
  const [stack, setStack] = useState<P[]>([first])
  const stackRef = useRef(stack)
  const [turn, setTurn] = useState<Turn>() // unset until the first page turn, so the first render does not fade
  const pageRef = useRef<HTMLDivElement>(null)
  const commit = useCallback((next: P[]) => { stackRef.current = next; setStack(next); setTurn({ key: next[next.length - 1] + ':' + Date.now() }) }, [])
  const go = useCallback((p: P) => commit([...stackRef.current, p]), [commit])
  /** Back to the first page in one step (a tab was tapped, or the sheet was closed). */
  const reset = useCallback(() => { if (stackRef.current.length > 1) commit([first]) }, [commit, first])
  // the control that was tapped is gone after a turn: put focus on the new page
  useEffect(() => { if (turn) pageRef.current?.focus({ preventScroll: true }) }, [turn])
  /** Returns true when it went up a page. */
  const goUp = useCallback((): boolean => {
    if (stackRef.current.length < 2) return false
    commit(stackRef.current.slice(0, -1))
    return true
  }, [commit])
  return { page: stack[stack.length - 1], go, goUp, reset, turn, pageRef }
}

interface Props {
  snapPoints: (string | number)[]
  snap: string | number
  onSnap: (s: string | number) => void
  /** Called for Escape and the phone's back gesture. */
  onEscape: () => void
  /** Called for a hard downward flick (Base UI reports it as a dismissal, snap point null). The sheet never unmounts: the caller lowers it one step. */
  onFlickDown: () => void
  turn?: Turn
  pageRef: RefObject<HTMLDivElement | null>
  /** Drag handle label for assistive tech. */
  handleLabel: string
  /** Accessible name of the sheet. */
  title: string
  onHandle: () => void
  children: ReactNode
}
/** Mobile: a bottom drawer that is always open, non-modal (the map stays usable), with snap points. */
export function PagedDrawer({ snapPoints, snap, onSnap, onEscape, onFlickDown, turn, pageRef, handleLabel, title, onHandle, children }: Props) {
  return (
    <Drawer
      open modal={false} disablePointerDismissal showSwipeHandle
      snapPoints={snapPoints} snapPoint={snap} onSnapPointChange={(s, d) => { if (s != null) onSnap(s); else { d.cancel(); onFlickDown() } }}
      onOpenChange={(o, d) => { if (!o) { d.cancel(); if (d.reason === 'escape-key' || d.reason === 'close-watcher') onEscape() } }}
    >
      <DrawerContent aria-label={title} initialFocus={false} handleSlot={<HandleButton label={handleLabel} onTap={onHandle} />}>
        <PageFrame turn={turn} pageRef={pageRef}>{children}</PageFrame>
      </DrawerContent>
    </Drawer>
  )
}

/** The visible grab bar is decoration; this is its button: a tap cycles the sheet. A mouse drag that starts here moves the sheet, and must not count as a tap. */
function HandleButton({ label, onTap }: { label: string; onTap: () => void }) {
  const down = useRef<number | null>(null)
  return (
    <button
      type="button" aria-label={label} data-testid="handle"
      onPointerDown={e => { down.current = e.clientY }}
      onClick={e => { const moved = down.current != null && Math.abs(e.clientY - down.current) > 6; down.current = null; if (!moved) onTap() }}
      className="absolute left-1/2 top-0 z-20 h-7 w-24 -translate-x-1/2 cursor-grab border-0 bg-transparent p-0"
    />
  )
}

/** One page: fades in when `turn` changes. Shared by the mobile drawer and the desktop side panel. */
export function PageFrame({ turn, pageRef, children }: { turn?: Turn; pageRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div key={turn?.key} ref={pageRef} tabIndex={-1} className={`flex min-h-0 flex-1 flex-col outline-none ${turn ? 'page-in' : ''}`}>
      {children}
    </div>
  )
}

/** Run `fn` after layout when `dep` changes (used to scroll a page to the top after a turn). */
export function useAfterTurn(dep: unknown, fn: () => void) {
  const f = useRef(fn); f.current = fn
  useLayoutEffect(() => { f.current() }, [dep])
}
