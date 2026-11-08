import { useCallback, useEffect, useRef, useState } from 'react'
import { dist } from '../lib/geo'
import type { LatLon } from '../lib/types'

/** While the app is open and shown, the position follows you; it updates after you moved this many metres (saves battery and the street-route requests). */
const FOLLOW_STEP_M = 30

export type LocateAnswer = 'granted' | 'denied' | 'error'

/** Browser geolocation. The position stays in memory on this device; it is never sent anywhere. */
export function useLocation(onAnswer?: (a: LocateAnswer) => void, follow = true) {
  const [pos, setPos] = useState<LatLon | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)
  const busy = useRef(false)
  const perm = useRef<PermissionState | 'unknown'>('unknown')
  const answer = useRef(onAnswer)
  answer.current = onAnswer
  const last = useRef<LatLon | null>(null)
  last.current = pos
  const [shown, setShown] = useState(() => document.visibilityState !== 'hidden')
  const has = !!pos

  // follow the person once the first position is known: only while the page is visible, and only a real move changes `pos`
  useEffect(() => {
    const onVis = () => setShown(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  useEffect(() => {
    if (!has || !shown || !follow || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(p => {
      const ll: LatLon = [p.coords.latitude, p.coords.longitude]
      if (!last.current || dist(last.current, ll) >= FOLLOW_STEP_M) setPos(ll)
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [has, shown, follow])

  // follow the browser's permission state (so a blocked site is known before the first tap, and a change in settings is noticed)
  useEffect(() => {
    let st: PermissionStatus | undefined, off = false
    const sync = () => { if (!st) return; perm.current = st.state; if (st.state === 'denied') setDenied(true); else if (st.state === 'granted') setDenied(false) }
    navigator.permissions?.query({ name: 'geolocation' }).then(s => { if (off) return; st = s; sync(); s.addEventListener('change', sync) }).catch(() => {})
    return () => { off = true; st?.removeEventListener('change', sync) }
  }, [])

  /** Ask for the position. `asked` = the person did it (first tap or the button): then the answer is reported. Call it inside the tap handler. */
  const locate = useCallback((asked = false): Promise<LatLon | null> => new Promise(res => {
    if (busy.current) return res(null)
    if (!navigator.geolocation) { setDenied(true); if (asked) answer.current?.('denied'); return res(null) }
    busy.current = true; setLocating(true)
    navigator.geolocation.getCurrentPosition(p => {
      const ll: LatLon = [p.coords.latitude, p.coords.longitude]
      busy.current = false; setPos(ll); setDenied(false); setLocating(false)
      if (asked) answer.current?.('granted')
      res(ll)
    }, e => {
      busy.current = false; setLocating(false)
      const no = e.code === 1 // PERMISSION_DENIED; a timeout or "unavailable" is not a refusal, the button stays
      setDenied(no)
      if (asked) answer.current?.(no ? 'denied' : 'error')
      res(null)
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
  }), [])

  /** True when the browser already granted permission (so we can locate without asking). */
  const alreadyGranted = useCallback(async () => {
    try { return (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted' } catch { return false }
  }, [])
  /** Synchronous: has the person blocked location for this site? */
  const blocked = useCallback(() => perm.current === 'denied', [])
  return { pos, locating, denied, locate, alreadyGranted, blocked }
}
