import type { LayerConfig } from '../lib/types'
import { cityWifiItems, cityWifiRaw, cityWifiRows } from './city'
import { osmPart } from './osm'
import { WIFI_SNAPSHOT } from './wifi-snapshot'

export const wifi: LayerConfig = {
  id: 'wifi', icon: '📶', color: '#0b57d0', label: { en: 'WiFi', es: 'WiFi' }, hint: { en: 'Free WiFi', es: 'WiFi gratis' },
  hours: true, cats: ['muni', 'food', 'other'],
  parts: [
    { k: 'city', load: async () => cityWifiItems(cityWifiRows(await cityWifiRaw())), snap: () => cityWifiItems(WIFI_SNAPSHOT) },
    { k: 'osm', load: osmPart('wifi') },
  ],
}
