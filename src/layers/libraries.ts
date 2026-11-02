import type { LayerConfig } from '../lib/types'
import { cityEquipItems, cityLibRaw } from './city'

export const libraries: LayerConfig = {
  id: 'libraries', icon: '📚', color: '#15803d', label: { en: 'Libraries', es: 'Bibliotecas' }, hint: { en: 'Quiet and free', es: 'Tranquilas y gratis' },
  hours: false, more: true, parts: [{ k: 'city', load: async () => cityEquipItems(await cityLibRaw(), 'lib') }],
}
