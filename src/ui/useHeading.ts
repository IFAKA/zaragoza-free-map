import { useCallback, useEffect, useState } from 'react'

type IOSEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
type Orient = DeviceOrientationEvent & { webkitCompassHeading?: number }

/**
 * Compass bearing (0 = north, clockwise) from the phone's alpha, beta and gamma.
 * Held flat or tilted a little (a map in your hand): where the top of the phone points. Held upright (walking with it up): where the back points.
 */
const bearing = (alpha: number, beta: number, gamma: number): number => {
  const r = Math.PI / 180, cA = Math.cos(alpha * r), sA = Math.sin(alpha * r), sB = Math.sin(beta * r), cB = Math.cos(beta * r), sG = Math.sin(gamma * r), cG = Math.cos(gamma * r)
  const h = Math.abs(beta) < 50
    ? Math.atan2(-sA * cB, cA * cB) / r // the top edge: alpha counts anticlockwise, so flat this is 360 - alpha
    : Math.atan2(-cA * sG - sA * sB * cG, -sA * sG + cA * sB * cG) / r // the back of the phone
  return (h + 360) % 360
}

/**
 * The direction the phone points, in real time, while `on`. Null until the first reading (and on a device with no compass).
 * `enable` must be called from a tap: iPhone asks permission there. It answers whether the compass may be used.
 */
export function useHeading() {
  const [on, setOn] = useState(false)
  const [heading, setHeading] = useState<number | null>(null)

  const enable = useCallback(async (): Promise<boolean> => {
    if (typeof DeviceOrientationEvent === 'undefined') return false
    const ask = (DeviceOrientationEvent as IOSEvent).requestPermission
    if (ask) { try { if (await ask.call(DeviceOrientationEvent) !== 'granted') return false } catch { return false } }
    setOn(true)
    return true
  }, [])
  const disable = useCallback(() => { setOn(false); setHeading(null) }, [])

  useEffect(() => {
    if (!on) return
    let cur: number | null = null, t = 0
    const push = (h: number) => {
      // smooth the jitter along the short way round the circle, and at most about 20 times a second
      cur = cur == null ? h : (cur + ((((h - cur) % 360) + 540) % 360 - 180) * 0.35 + 360) % 360
      const now = performance.now()
      if (now - t > 50) { t = now; setHeading(Math.round(cur)) }
    }
    const onAbs = (e: Event) => { const o = e as Orient; if (o.alpha != null && o.beta != null && o.gamma != null) push(bearing(o.alpha, o.beta, o.gamma)) }
    const onIos = (e: Event) => { const o = e as Orient; if (typeof o.webkitCompassHeading === 'number') push(o.webkitCompassHeading) }
    const ios = 'webkitCompassHeading' in DeviceOrientationEvent.prototype
    const name = ios ? 'deviceorientation' : 'deviceorientationabsolute'
    window.addEventListener(name, ios ? onIos : onAbs)
    return () => window.removeEventListener(name, ios ? onIos : onAbs)
  }, [on])

  return { on, heading, enable, disable }
}
