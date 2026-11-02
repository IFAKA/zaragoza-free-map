import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Drawer, DrawerContent } from './ui/drawer'

/**
 * Pages inside ONE drawer (same mechanics as the suitkeep menu): a submenu is a page, not a second drawer.
 * - a new page fades in over 300ms (keyed by turn.key);
 * - the drawer eases to the height the new page needs (snap point change, 450ms) instead of jumping;
 * - Back, Escape, the phone's back gesture and a swipe down at the lowest snap all go up one page;
 * - it resets to the first page after it has slid away.
 */
export interface Turn { key: string }
export function usePages<P extends string>(first: P, up: (page: P) => P | null) {
  const [page, setPage] = useState<P>(first)
  const [turn, setTurn] = useState<Turn>() // unset until the first page turn, so the first render does not fade
  const pageRef = useRef<HTMLDivElement>(null)
  const go = useCallback((p: P) => { setPage(p); setTurn({ key: p + ':' + Date.now() }) }, [])
  // the control that was tapped is gone after a turn: put focus on the new page
  useEffect(() => { if (turn) pageRef.current?.focus({ preventScroll: true }) }, [turn])
  /** Returns true when it handled the request by going up a page (the caller then cancels the close). */
  const goUp = useCallback((): boolean => {
    if (page === first) return false
    go(up(page) ?? first)
    return true
  }, [page, first, go, up])
  return { page, go, goUp, turn, pageRef }
}

interface Props {
  snapPoints: (string | number)[]
  snap: string | number
  onSnap: (s: string | number) => void
  /** Called for Escape, the back gesture and a swipe past the lowest snap. Return true when a page went up. */
  onDismissRequest: () => boolean
  turn?: Turn
  pageRef: RefObject<HTMLDivElement | null>
  /** Drag handle label for assistive tech. */
  handleLabel: string
  onHandle: () => void
  children: ReactNode
}
/** Mobile: a bottom drawer that is always open, non-modal (the map stays usable), with snap points. */
export function PagedDrawer({ snapPoints, snap, onSnap, onDismissRequest, turn, pageRef, handleLabel, onHandle, children }: Props) {
  return (
    <Drawer
      open modal={false} disablePointerDismissal showSwipeHandle
      snapPoints={snapPoints} snapPoint={snap} onSnapPointChange={s => { if (s != null) onSnap(s) }}
      onOpenChange={(o, d) => { if (!o) { d.cancel(); onDismissRequest() } }}
    >
      <DrawerContent aria-label="Free services">
        <button
          type="button" aria-label={handleLabel} onClick={onHandle} data-testid="handle"
          className="absolute inset-x-0 top-0 z-20 h-9 cursor-grab border-0 bg-transparent p-0"
        />
        <PageFrame turn={turn} pageRef={pageRef}>{children}</PageFrame>
      </DrawerContent>
    </Drawer>
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
