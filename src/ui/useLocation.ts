import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLon } from '../lib/types'

export type LocateAnswer = 'granted' | 'denied' | 'error'

/** Browser geolocation. The position stays in memory on this device; it is never sent anywhere. */
export function useLocation(onAnswer?: (a: LocateAnswer) => void) {
  const [pos, setPos] = useState<LatLon | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)
  const busy = useRef(false)
  const perm = useRef<PermissionState | 'unknown'>('unknown')
  const answer = useRef(onAnswer)
  answer.current = onAnswer

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
