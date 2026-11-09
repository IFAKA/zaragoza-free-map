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
export const srcExplain = (t: TF, it: Item): string => (it.type === 'postbox' ? t('srcInfoPostbox') : it.part === 'osm' ? t('srcInfoOsm') : it.part === 'tgo' ? t('srcInfoTgo') : t('srcInfoCity'))
/** One tap to tell the map's owners something is wrong: opens the OpenStreetMap note form at this spot. */
export const reportUrl = (it: Item) => `https://www.openstreetmap.org/note/new#map=19/${it.lat}/${it.lon}`
/** The bus company's live times page for a city stop (third-party; it sends no CORS header, so the app links to it and never fetches it). */
export const BUZ_URL = 'https://biblioteca.unizar.es/servicios/ocupacion-bibliotecas'

const DAYS_ES: Record<string, string> = { Mo: 'Lu', Tu: 'Ma', We: 'Mi', Th: 'Ju', Fr: 'Vi', Sa: 'Sá', Su: 'Do', PH: 'festivos', off: 'cerrado', '24/7': '24 h' }
const DAYS_EN: Record<string, string> = { PH: 'holidays', off: 'closed', '24/7': '24 h' }
/** OpenStreetMap opening hours ("Mo-Fr 08:30-21:30; Sa-Su off") in the reader's language. */
export function fmtHours(lang: 'en' | 'es', s: string): string {
  const map = lang === 'es' ? DAYS_ES : DAYS_EN
  return s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b|24\/7/g, m => map[m] ?? m)
}

const plural = (t: TF, n: number, one: Key, many: Key) => `${n} ${t(n === 1 ? one : many)}`
/** "5 bikes · 12 free docks"; with `electric`, "5 bikes (2 electric) · 12 free docks". Empty when the station has no live counts. */
export function biziLine(t: TF, it: Pick<Item, 'bikes' | 'docks' | 'ebikes'>, electric = false): string {
  if (it.bikes === undefined || it.docks === undefined) return ''
  const e = electric && it.ebikes ? ` (${t('ebikesN').replace('{n}', String(it.ebikes))})` : ''
  return `${plural(t, it.bikes, 'bikeOne', 'bikeMany')}${e} · ${plural(t, it.docks, 'dockOne', 'dockMany')}`
}
/** Madrid clock time of a moment, "14:32". */
export const clockMadrid = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(ms)
