import { useCallback, useRef, useState } from 'react'
import type { LatLon } from '../lib/types'

/** Browser geolocation. The position stays in memory on this device; it is never sent anywhere. */
export function useLocation() {
  const [pos, setPos] = useState<LatLon | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)
  const busy = useRef(false)

  const locate = useCallback((): Promise<LatLon | null> => new Promise(res => {
    if (busy.current) return res(null)
    if (!navigator.geolocation) { setDenied(true); return res(null) }
    busy.current = true; setLocating(true)
    navigator.geolocation.getCurrentPosition(p => {
      const ll: LatLon = [p.coords.latitude, p.coords.longitude]
      busy.current = false; setPos(ll); setDenied(false); setLocating(false); res(ll)
    }, () => {
      busy.current = false; setDenied(true); setLocating(false); res(null)
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
  }), [])

  /** True when the browser already granted permission (so we can locate without asking). */
  const alreadyGranted = useCallback(async () => {
    try { return (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted' } catch { return false }
  }, [])
  return { pos, locating, denied, locate, alreadyGranted }
}
