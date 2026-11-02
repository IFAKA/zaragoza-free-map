import type { LayerConfig } from '../lib/types'
import { osmPart } from './osm'

export const water: LayerConfig = {
  id: 'water', icon: '💧', color: '#0891b2', label: { en: 'Water', es: 'Agua' }, hint: { en: 'Drinking fountains', es: 'Fuentes de agua' },
  hours: false, parts: [{ k: 'osm', load: osmPart('water') }],
}
