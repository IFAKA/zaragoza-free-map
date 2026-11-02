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

const DAYS_ES: Record<string, string> = { Mo: 'Lu', Tu: 'Ma', We: 'Mi', Th: 'Ju', Fr: 'Vi', Sa: 'Sá', Su: 'Do', PH: 'festivos', off: 'cerrado', '24/7': '24 h' }
const DAYS_EN: Record<string, string> = { PH: 'holidays', off: 'closed', '24/7': '24 h' }
/** OpenStreetMap opening hours ("Mo-Fr 08:30-21:30; Sa-Su off") in the reader's language. */
export function fmtHours(lang: 'en' | 'es', s: string): string {
  const map = lang === 'es' ? DAYS_ES : DAYS_EN
  return s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b|24\/7/g, m => map[m] ?? m)
}
