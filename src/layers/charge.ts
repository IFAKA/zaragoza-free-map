import type { LayerConfig } from '../lib/types'
import { cityCivicRaw, cityEquipItems, cityLibRaw } from './city'
import { osmPart } from './osm'

export const charge: LayerConfig = {
  id: 'charge', icon: '🔌', color: '#d97706', label: { en: 'Charge', es: 'Cargar' }, hint: { en: 'Charge your phone', es: 'Cargar el móvil' },
  hours: true,
  parts: [
    { k: 'osm', load: osmPart('charge') },
    { k: 'city', load: async () => { const [a, b] = await Promise.all([cityLibRaw(), cityCivicRaw()]); return [...cityEquipItems(a, 'lib'), ...cityEquipItems(b, 'civic')] } },
  ],
}
