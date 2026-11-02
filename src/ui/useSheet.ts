import { useCallback, useEffect, useRef, useState, type KeyboardEvent as RKeyEvent, type PointerEvent as RPointerEvent } from 'react'

/** Bottom sheet with 3 snap points (0 full, 1 half, 2 peek): drag + flick, and scroll hand-off from the list.
 *  Our own hook: Base UI's Drawer is built for dismissable overlays; we need a never-closed sheet that becomes a sidebar on desktop. */
export const DESKTOP_Q = '(min-width:900px)'
export const isDesktop = () => matchMedia(DESKTOP_Q).matches

interface Drag { y0: number; base: number; ly: number; lt: number; v: number; moved: boolean }

export function useSheet() {
  const sheetRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [cur, setCur] = useState(1)
  const curRef = useRef(1)
  const geo = useRef({ FULL: 0, snapTy: [0, 0, 0], ty: 0 })
  const drag = useRef<Drag | null>(null)

  const layout = useCallback(() => {
    const sh = sheetRef.current
    if (!sh) return
    const g = geo.current, vh = innerHeight
    if (isDesktop()) { g.FULL = vh; g.snapTy = [0, 0, 0]; sh.style.height = ''; g.ty = 0; sh.style.setProperty('--ty', '0px'); return }
    g.FULL = Math.round(vh * 0.88)
    g.snapTy = [0, g.FULL - Math.round(vh * 0.46), g.FULL - 132]
    sh.style.height = g.FULL + 'px'
    g.ty = g.snapTy[curRef.current]
    sh.style.setProperty('--ty', g.ty + 'px')
  }, [])

  const snapTo = useCallback((i: number) => { curRef.current = i; setCur(i); layout() }, [layout])
  /** Pixels of the map hidden under the sheet (0 on desktop). */
  const inset = useCallback(() => (isDesktop() ? 0 : geo.current.FULL - geo.current.snapTy[curRef.current]), [])

  const dStart = useCallback((y: number) => {
    const sh = sheetRef.current
    if (isDesktop() || !sh) return false
    drag.current = { y0: y, base: geo.current.ty, ly: y, lt: performance.now(), v: 0, moved: false }
    sh.style.transition = 'none'
    return true
  }, [])
  const dMove = useCallback((y: number) => {
    const d = drag.current, sh = sheetRef.current
    if (!d || !sh) return
    const now = performance.now(), dt = Math.max(1, now - d.lt)
    d.v = 0.8 * d.v + 0.2 * ((y - d.ly) / dt); d.ly = y; d.lt = now
    if (Math.abs(y - d.y0) > 4) d.moved = true
    const g = geo.current
    g.ty = Math.min(g.snapTy[2], Math.max(0, d.base + (y - d.y0)))
    sh.style.setProperty('--ty', g.ty + 'px')
  }, [])
  const dEnd = useCallback(() => {
    const d = drag.current, sh = sheetRef.current
    if (!d || !sh) return false
    sh.style.transition = ''
    const proj = geo.current.ty + d.v * 180
    let best = 0, bd = 1e9
    geo.current.snapTy.forEach((s, i) => { const x = Math.abs(s - proj); if (x < bd) { bd = x; best = i } })
    drag.current = null
    if (d.moved) snapTo(best)
    return d.moved
  }, [snapTo])

  /** Props for the handle button (isHandle) and the draggable title/status areas. */
  const dragProps = (isHandle: boolean) => ({
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (!isHandle && (e.target as HTMLElement).closest('button,a,[role=switch],label')) return
      if (!dStart(e.clientY)) return
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => { if (drag.current) dMove(e.clientY) },
    onPointerUp: () => { if (!drag.current) return; const moved = dEnd(); if (!moved && isHandle) snapTo(curRef.current === 1 ? 0 : 1) },
    onPointerCancel: () => { if (drag.current) dEnd() },
  })
  const onHandleKey = (e: RKeyEvent) => {
    if (e.key === 'ArrowUp') snapTo(Math.max(0, curRef.current - 1))
    if (e.key === 'ArrowDown') snapTo(Math.min(2, curRef.current + 1))
  }

  useEffect(() => {
    layout()
    const onResize = () => layout()
    addEventListener('resize', onResize)
    // list: native scroll only when fully open; otherwise (or when pulling down at the top) the finger drags the sheet
    const list = listRef.current
    let ls: { y: number; mode: 'sheet' | 'scroll' | null } | null = null
    const ts = (e: TouchEvent) => { ls = { y: e.touches[0].clientY, mode: null } }
    const tm = (e: TouchEvent) => {
      if (!ls || isDesktop() || !list) return
      const y = e.touches[0].clientY, dy = y - ls.y
      if (ls.mode === null) {
        if (dy === 0) return
        ls.mode = curRef.current !== 0 || (list.scrollTop <= 0 && dy > 0) ? 'sheet' : 'scroll'
        if (ls.mode === 'sheet') dStart(ls.y)
      }
      if (ls.mode === 'sheet' && drag.current) { e.preventDefault(); dMove(y) }
    }
    const te = () => { if (ls && ls.mode === 'sheet' && drag.current) dEnd(); ls = null }
    list?.addEventListener('touchstart', ts, { passive: true })
    list?.addEventListener('touchmove', tm, { passive: false })
    list?.addEventListener('touchend', te)
    list?.addEventListener('touchcancel', te)
    return () => {
      removeEventListener('resize', onResize)
      list?.removeEventListener('touchstart', ts); list?.removeEventListener('touchmove', tm)
      list?.removeEventListener('touchend', te); list?.removeEventListener('touchcancel', te)
    }
  }, [layout, dStart, dMove, dEnd])

  return { sheetRef, listRef, cur, snapTo, inset, dragProps, onHandleKey }
}

export type DragProps = ReturnType<ReturnType<typeof useSheet>['dragProps']>
