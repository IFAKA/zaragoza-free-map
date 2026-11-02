import type { Key } from '../lib/i18n'
import type { Item } from '../lib/types'

type TF = (k: Key) => string
/** Honest source and age line for one record, e.g. "City record, 2023" or "OpenStreetMap, snapshot 2026-11-02, not verified by us". */
export function srcLabel(t: TF, it: Item): string {
  const snap = it.upd ? `${t('snapshot')} ${it.upd}` : ''
  if (it.part === 'osm') return [t('srcOsm'), snap, t('notVerified')].filter(Boolean).join(', ')
  if (it.part === 'tgo') return [t('srcTgo'), snap, t('notVerified')].filter(Boolean).join(', ')
  return [t('srcCity'), it.yr ? String(it.yr) : snap].filter(Boolean).join(', ')
}
export const srcExplain = (t: TF, it: Item): string => (it.part === 'osm' ? t('srcInfoOsm') : it.part === 'tgo' ? t('srcInfoTgo') : t('srcInfoCity'))
/** One tap to tell the map's owners something is wrong: opens the OpenStreetMap note form at this spot. */
export const reportUrl = (it: Item) => `https://www.openstreetmap.org/note/new#map=19/${it.lat}/${it.lon}`
export const BUZ_URL = 'https://biblioteca.unizar.es/servicios/ocupacion-bibliotecas'
