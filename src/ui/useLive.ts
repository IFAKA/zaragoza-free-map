import { useEffect, useState } from 'react'
import { LIVE_REFRESH_MS, type Live } from '../lib/live'
import { useLocating } from './sheet'

/**
 * Live times for one stop while the card is mounted: fetched at once, then every 30 s while the page is visible (paused while hidden).
 * While the person's position is still being found nothing is asked (the stop may change a moment later). The timer and the request in flight are stopped when the card goes away. `live` is the last good answer, dropped after 2 failures in a row;
 * `state` is 'live' only while the last fetch worked.
 */
/** The last good answer per stop, kept for one refresh period: a card that comes back (Back from a page) shows it at once, so the sheet does not change size again when the answer arrives. */
const recent = new Map<string, { live: Live; at: number }>()
const fresh = (key: string) => { const r = recent.get(key); return r && Date.now() - r.at < LIVE_REFRESH_MS ? r.live : null }

export function useLive(key: string, load: (signal: AbortSignal) => Promise<Live | null>) {
  const locating = useLocating()
  const [live, setLive] = useState<Live | null>(() => fresh(key))
  const [state, setState] = useState<'loading' | 'live' | 'failed'>(() => (fresh(key) ? 'live' : 'loading'))
  useEffect(() => {
    if (locating) return
    const f = fresh(key)
    setLive(f); setState(f ? 'live' : 'loading')
    let on = true, timer: ReturnType<typeof setInterval> | undefined, ctl: AbortController | undefined, fails = 0
    const run = async () => {
      ctl?.abort(); ctl = new AbortController()
      const r = await load(ctl.signal)
      if (!on || ctl.signal.aborted) return
      if (r) { fails = 0; recent.set(key, { live: r, at: Date.now() }); setLive(r); setState('live') } else { setState('failed'); if (++fails >= 2) setLive(null) }
    }
    const stop = () => { clearInterval(timer); timer = undefined; ctl?.abort() }
    const start = () => { stop(); void run(); timer = setInterval(run, LIVE_REFRESH_MS) }
    const onVis = () => { if (document.hidden) stop(); else start() }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => { on = false; stop(); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locating])
  return { live, state }
}
