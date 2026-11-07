import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { useReducedMotion } from 'motion/react'
import { MS } from './motion'
import { Drawer, DrawerContent } from './ui/drawer'

/**
 * Pages inside ONE drawer (same mechanics as the suitkeep menu): a submenu is a page, not a second drawer.
 * - pages form a real stack: `go` pushes, `goUp` pops, so Back returns to the page you came from;
 * - fade through: the old page fades out (MS.pageOut) and is only then replaced by the new one, which fades in over 150ms (keyed by turn.key);
 * - the drawer eases to the height the new page needs (snap point change, 300ms) instead of jumping.
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
  /** The new page is on screen (the old one has faded out). */
  onShown?: () => void
  pageRef: RefObject<HTMLDivElement | null>
  /** Drag handle label for assistive tech. */
  handleLabel: string
  /** Accessible name of the sheet. */
  title: string
  onHandle: () => void
  children: ReactNode
}
/** Mobile: a bottom drawer that is always open, non-modal (the map stays usable), with snap points. */
export function PagedDrawer({ snapPoints, snap, onSnap, onEscape, onFlickDown, turn, onShown, pageRef, handleLabel, title, onHandle, children }: Props) {
  return (
    <Drawer
      open modal={false} disablePointerDismissal showSwipeHandle
      snapPoints={snapPoints} snapPoint={snap} onSnapPointChange={(s, d) => { if (s != null) onSnap(s); else { d.cancel(); onFlickDown() } }}
      onOpenChange={(o, d) => { if (!o) { d.cancel(); if (d.reason === 'escape-key' || d.reason === 'close-watcher') onEscape() } }}
    >
      <DrawerContent aria-label={title} initialFocus={false} handleSlot={<HandleButton label={handleLabel} onTap={onHandle} />}>
        <PageFrame turn={turn} onShown={onShown} pageRef={pageRef}>{children}</PageFrame>
      </DrawerContent>
    </Drawer>
  )
}

/** The visible grab bar is decoration; this is its button: a tap cycles the sheet. A mouse drag that starts here moves the sheet, and must not count as a tap. */
function HandleButton({ label, onTap }: { label: string; onTap: () => void }) {
  const down = useRef<number | null>(null)
  return (
    <BaseButton
      aria-label={label} data-testid="handle"
      onPointerDown={e => { down.current = e.clientY }}
      onClick={e => { const moved = down.current != null && Math.abs(e.clientY - down.current) > 6; down.current = null; if (!moved) onTap() }}
      className="absolute left-1/2 top-0 z-20 h-7 w-24 -translate-x-1/2 cursor-grab border-0 bg-transparent p-0"
    />
  )
}

/**
 * One page, fading through when `turn` changes. Shared by the mobile drawer and the desktop side panel.
 * `shown` is the turn on screen. After a turn the OLD page (its last children, frozen) fades out for MS.pageOut, then `shown` catches up
 * (the key changes, so the new page mounts and fades in). A turn during the fade-out only moves the target: nothing restarts, one page at a time.
 */
export function PageFrame({ turn, onShown, pageRef, children }: { turn?: Turn; onShown?: () => void; pageRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(turn) // equal to `turn` on the first render, so it does not fade
  const latest = useRef(turn); latest.current = turn
  const kept = useRef(children)
  const leaving = turn !== shown
  if (!leaving) kept.current = children
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setShown(latest.current), reduced ? 0 : MS.pageOut)
    return () => clearTimeout(id)
  }, [leaving, reduced])
  const shownCb = useRef(onShown); shownCb.current = onShown
  // the control that was tapped is gone after a turn: put focus on the new page
  useEffect(() => { if (shown) { pageRef.current?.focus({ preventScroll: true }); shownCb.current?.() } }, [shown, pageRef])
  return (
    <div key={shown?.key} ref={pageRef} tabIndex={-1} inert={leaving || undefined} className={`flex min-h-0 flex-1 flex-col outline-none ${shown ? 'page-in' : ''} ${leaving && !reduced ? 'page-out' : ''}`}>
      {leaving ? kept.current : children}
    </div>
  )
}

/** Run `fn` after layout when `dep` changes (used to scroll a page to the top after a turn). */
export function useAfterTurn(dep: unknown, fn: () => void) {
  const f = useRef(fn); f.current = fn
  useLayoutEffect(() => { f.current() }, [dep])
}
