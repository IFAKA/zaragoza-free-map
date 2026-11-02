import { BatteryCharging, Bicycle, BookOpenText, Drop, LockKey, Thermometer, Toilet, WifiHigh, type Icon } from '@phosphor-icons/react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { IconKey } from '../lib/types'

export const ICONS: Record<IconKey, Icon> = { drop: Drop, toilet: Toilet, charge: BatteryCharging, wifi: WifiHigh, library: BookOpenText, bike: Bicycle, lock: LockKey, shelter: Thermometer }

const cache = new Map<IconKey, string>()
/** SVG markup of a need's icon (for Leaflet markers, which are plain HTML). Rendered once per icon. */
export function iconHtml(key: IconKey): string {
  let h = cache.get(key)
  if (h === undefined) {
    const I = ICONS[key]
    h = renderToStaticMarkup(<I weight="fill" aria-hidden />)
    cache.set(key, h)
  }
  return h
}
