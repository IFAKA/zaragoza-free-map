import { useEffect, useState } from 'react'
import { REFRESH_MS, isFresh, loadBizi, readBiziCache, type BiziCounts, type BiziLive } from '../lib/bizi'
import type { Item } from '../lib/types'

/**
 * Live Bizi counts while `active` (the Bizi tab is open): fetched at once, then every 60 s while the page is visible, paused while hidden.
 * `counts` is null unless they are at most 5 minutes old at this moment; `state` says why ('loading' = first answer not in yet, 'failed' = no fresh counts).
 */
export function useBizi(active: boolean, stations: Pick<Item, 'id' | 'name' | 'lat' | 'lon'>[]) {
  const [live, setLive] = useState<BiziLive | null>(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!active) return
    let on = true, fetchTimer: ReturnType<typeof setInterval> | undefined, clock: ReturnType<typeof setInterval> | undefined
    setNow(Date.now()); setLive(readBiziCache(Date.now())); setFailed(false)
    const run = async () => {
      const r = await loadBizi(stations)
      if (!on) return
      setNow(Date.now())
      if (r) { setLive(r); setFailed(false) } else setFailed(true)
    }
    const stop = () => { clearInterval(fetchTimer); clearInterval(clock) }
    const start = () => {
      stop(); setNow(Date.now()); void run()
      fetchTimer = setInterval(run, REFRESH_MS)
      clock = setInterval(() => setNow(Date.now()), 15_000) // old counts stop showing on time even if a fetch hangs
    }
    const onVis = () => { if (document.hidden) stop(); else start() }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVis)
    return () => { on = false; stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [active, stations, tries])
  const counts: BiziCounts | null = active && live && isFresh(live.at, now) ? live.counts : null
  return { counts, at: live?.at ?? 0, state: counts ? ('live' as const) : failed ? ('failed' as const) : ('loading' as const), retry: () => { setFailed(false); setTries(n => n + 1) } }
}
