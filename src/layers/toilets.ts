import type { LayerConfig } from '../lib/types'
import { osmPart } from './osm'
import { loadTgo, tgoItems } from './tgo'
import { TGO_SNAPSHOT } from './tgo-snapshot'

export const toilets: LayerConfig = {
  id: 'toilets', icon: '🚻', color: '#7c3aed', label: { en: 'Toilet', es: 'Aseo' }, hint: { en: 'Free public toilets', es: 'Aseos gratis' },
  hours: true, parts: [{ k: 'osm', load: osmPart('toilets') }, { k: 'tgo', load: loadTgo, snap: () => tgoItems(TGO_SNAPSHOT) }],
}
