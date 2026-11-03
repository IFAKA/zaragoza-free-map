import { useEffect, useState } from 'react'
import { LIVE_REFRESH_MS, type Live } from '../lib/live'

/**
 * Live times for one stop while the card is mounted: fetched at once, then every 30 s while the page is visible (paused while hidden).
 * The timer and the request in flight are stopped when the card goes away. `live` is the last good answer, dropped after 2 failures in a row;
 * `state` is 'live' only while the last fetch worked.
 */
export function useLive(key: string, load: (signal: AbortSignal) => Promise<Live | null>) {
  const [live, setLive] = useState<Live | null>(null)
  const [state, setState] = useState<'loading' | 'live' | 'failed'>('loading')
  useEffect(() => {
    setLive(null); setState('loading')
    let on = true, timer: ReturnType<typeof setInterval> | undefined, ctl: AbortController | undefined, fails = 0
    const run = async () => {
      ctl?.abort(); ctl = new AbortController()
      const r = await load(ctl.signal)
      if (!on || ctl.signal.aborted) return
      if (r) { fails = 0; setLive(r); setState('live') } else { setState('failed'); if (++fails >= 2) setLive(null) }
    }
    const stop = () => { clearInterval(timer); timer = undefined; ctl?.abort() }
    const start = () => { stop(); void run(); timer = setInterval(run, LIVE_REFRESH_MS) }
    const onVis = () => { if (document.hidden) stop(); else start() }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => { on = false; stop(); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { live, state }
}
