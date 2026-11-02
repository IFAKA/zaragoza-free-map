import type { Key } from '../lib/i18n'
import type { Item } from '../lib/types'

type TF = (k: Key) => string
/** Honest source + age line for one item. */
export function srcLabel(t: TF, it: Item, live: boolean): string {
  if (it.part === 'osm') return `${t('srcOsm')}, ${t('notVerified')}${live ? '' : ' · ' + t('saved')}`
  if (it.part === 'tgo') return `${t('srcTgo')}, ${live ? t('live') : t('saved')} · ${t('notVerified')}`
  return `${t('srcCity')}, ${live ? (it.yr ? `${t('updated')} ${it.yr}` : t('live')) : t('saved') + (it.yr ? `, ${it.yr}` : '')}`
}
export const srcExplain = (t: TF, it: Item): string => (it.part === 'osm' ? t('srcInfoOsm') : it.part === 'tgo' ? t('srcInfoTgo') : t('srcInfoCity'))
export const reportUrl = (it: Item) => (it.osm ? `https://www.openstreetmap.org/${it.osm}` : `https://www.openstreetmap.org/#map=19/${it.lat}/${it.lon}`)
