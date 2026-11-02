import type { LayerConfig } from '../lib/types'
import { biziItems, biziRaw } from './city'

export const bizi: LayerConfig = {
  id: 'bizi', icon: '🚲', color: '#dc2626', label: { en: 'Bizi bikes', es: 'Bizi' }, hint: { en: 'Cheap bike share', es: 'Bici compartida barata' },
  hours: false, more: true, nearKey: 'nearestBikes',
  usable: it => it.est === 'IN_SERVICE' && (it.bikes == null || it.bikes > 0),
  parts: [{ k: 'city', load: async () => biziItems(await biziRaw()) }],
}
