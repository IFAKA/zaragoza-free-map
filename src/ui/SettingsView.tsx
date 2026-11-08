import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '../lib/analytics'
import type { Lang } from '../lib/i18n'
import { AboutPage, InstallPage, LanguagePage, SettingsPage, ThemePage } from './Pages'
import { viewVariants } from './motion'

export type ViewPage = 'settings' | 'theme' | 'language' | 'about' | 'install'

/**
 * Settings is a full view over the map and the sheet, not a page of the sheet. It keeps its own stack of pages (Settings, then Language or About)
 * and one browser history entry per page, so the Android back gesture and the browser Back go up one level, then close it.
 */
export function useSettingsView() {
  const [stack, setStack] = useState<ViewPage[]>([])
  const depth = useRef(0)
  const how = useRef<'x' | 'back' | 'escape'>('back') // how the view is being closed, for the closing event: the cross, a back step (chevron, gesture, browser), or Escape
  useEffect(() => {
    // back by one or by many entries (the close cross goes back by all of them): keep as many pages as the history entry says
    const onPop = () => {
      const n = Math.min(Number(history.state?.zgz) || 0, depth.current)
      if (n === 0 && depth.current > 0) { track('settings-close', how.current); how.current = 'back' }
      depth.current = n
      setStack(s => s.slice(0, n))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const push = useCallback((p: ViewPage) => { depth.current++; history.pushState({ zgz: depth.current }, ''); setStack(s => [...s, p]) }, [])
  const open = useCallback((first: ViewPage = 'settings') => { if (depth.current === 0) { track('settings-open'); push(first) } }, [push])
  /** Up one level (the last page closes: the view slides out). Goes through history so the gesture and the buttons agree. */
  const back = useCallback((by: 'back' | 'escape' = 'back') => { if (depth.current > 0) { how.current = by; history.back() } }, [])
  /** The close cross: closes the whole view, from any page. */
  const close = useCallback(() => { if (depth.current > 0) { how.current = 'x'; history.go(-depth.current) } }, [])
  return { stack, open, push, back, close, isOpen: stack.length > 0 }
}

/** True at the width where the app shows the side panels (the same 900 px as the min-[900px] classes). */
function useDesktop() {
  const [yes, setYes] = useState(() => matchMedia('(min-width: 900px)').matches)
  useEffect(() => {
    const mq = matchMedia('(min-width: 900px)'), on = () => setYes(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return yes
}

/** The full view: slides in from the right (where its button is), a page inside it slides over the first. Desktop: a 420 px panel on the right. */
export function SettingsView({ stack, push, back, close, lang, setLang, title }: { stack: ViewPage[]; push: (p: ViewPage) => void; back: (by?: 'back' | 'escape') => void; close: () => void; lang: Lang; setLang: (l: Lang) => void; title: string }) {
  const reduced = !!useReducedMotion()
  const v = viewVariants(reduced)
  const open = stack.length > 0
  const last = useRef<ViewPage[]>(stack)
  if (open) last.current = stack
  const shown = last.current
  const root = useRef<HTMLDivElement>(null)
  const desktop = useDesktop()

  // while open: on a phone the app behind cannot take focus or scroll and focus moves into the view; on desktop the map and the sheet stay usable. Escape closes one level
  useEffect(() => {
    if (!open) return
    const app = desktop ? null : document.getElementById('root')
    if (app) { app.setAttribute('inert', ''); document.body.style.overflow = 'hidden' }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); back('escape') } }
    window.addEventListener('keydown', key, true)
    return () => { if (app) { app.removeAttribute('inert'); document.body.style.overflow = '' } window.removeEventListener('keydown', key, true) }
  }, [open, back, desktop])
  useEffect(() => { if (open && !desktop) root.current?.focus({ preventScroll: true }) }, [open, shown.length, desktop])

  // the chevron only on a page that was pushed over another; the root of the view has only the cross
  const page = (p: ViewPage, sub: boolean) => p === 'settings'
    ? <SettingsPage lang={lang} onClose={close} locked={false} go={push} />
    : p === 'install' ? <InstallPage onBack={sub ? () => back() : undefined} onClose={close} locked={false} />
    : p === 'theme' ? <ThemePage onBack={sub ? () => back() : undefined} onClose={close} locked={false} />
    : p === 'language' ? <LanguagePage lang={lang} setLang={setLang} onBack={sub ? () => back() : undefined} onClose={close} locked={false} /> : <AboutPage onBack={sub ? () => back() : undefined} onClose={close} locked={false} />
  const box = 'absolute inset-0 flex flex-col bg-paper pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
  return createPortal(
    <AnimatePresence onExitComplete={() => document.querySelector<HTMLElement>('[data-testid=open-settings]')?.focus({ preventScroll: true })}>
      {open && (
        <m.div
          key="view" ref={root} tabIndex={-1} role="dialog" aria-modal={desktop ? undefined : true} aria-label={title} data-testid="settings-view"
          variants={v} initial="out" animate="in" exit="out"
          className="fixed inset-y-0 right-0 z-[60] w-full overflow-hidden bg-paper outline-none min-[900px]:w-[420px] min-[900px]:border-l min-[900px]:border-line min-[900px]:shadow-[-2px_0_14px_rgb(0_0_0/0.12)]"
        >
          <div className={box} inert={shown.length > 1}>{page(shown[0], false)}</div>
          <AnimatePresence>
            {shown.slice(1).map(p => (
              <m.div key={p} variants={v} initial="out" animate="in" exit="out" className={box} data-testid={`view-${p}`}>{page(p, true)}</m.div>
            ))}
          </AnimatePresence>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
