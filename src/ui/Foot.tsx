import { CENTER } from '../lib/geo'
import { useT } from './lang'

export function Foot() {
  const { t } = useT()
  return (
    <li className="p-3.5 text-xs leading-relaxed text-mut">
      {t('privacy')}<br />
      <a className="text-pri underline" href={`https://www.openstreetmap.org/#map=17/${CENTER[0]}/${CENTER[1]}`} target="_blank" rel="noopener">{t('fixOsm')}</a><br />
      {t('credits')}
    </li>
  )
}
