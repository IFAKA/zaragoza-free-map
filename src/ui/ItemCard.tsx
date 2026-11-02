import { Button } from '@base-ui/react/button'
import { fmtDist, walkMins, walkUrl } from '../lib/geo'
import type { LayerConfig, RankedItem } from '../lib/types'
import { press } from './cls'
import { useT } from './lang'
import { reportUrl, srcLabel } from './labels'
import { SourceInfo } from './SourceInfo'

interface Common { layer: LayerConfig; item: RankedItem; live: boolean; onWalk: () => void }

function Details({ layer, item, live }: Omit<Common, 'onWalk'>) {
  const { t, type } = useT()
  const sub = 'mt-0.5 text-[12.5px] leading-snug text-mut'
  return (
    <>
      {(item.name || item.cust) && <div className={sub}>{type(item.type)}{item.cust ? ` · ${t('cust')}` : ''}</div>}
      {item.type === 'bizi' && (item.est && item.est !== 'IN_SERVICE'
        ? <div className={`${sub} font-semibold text-bad`}>{t('outOfService')}</div>
        : live && item.bikes != null && <div className={sub}><b>{item.bikes}</b> {t('bikes')} · <b>{item.docks ?? '?'}</b> {t('docks')}</div>)}
      {item.addr && <div className={sub}>{item.addr}</div>}
      {layer.hours && (
        <div className={sub}>
          {item.open === true ? <span className="font-semibold text-ok">{t('open')}</span>
            : item.open === false ? <span className="font-semibold text-bad">{t('closed')}</span> : t('hoursUnknown')}
          {item.hours && ` · ${t('hours')}: ${item.hours}`}
        </div>
      )}
      {item.ssid && <div className={sub}>WiFi: {item.ssid}</div>}
      <div className={sub}>{srcLabel(t, item, live)}</div>
    </>
  )
}

/** The large "nearest / selected" card pinned above the list. Appears instantly, no animation. */
export function PinCard({ layer, item, live, tag, onWalk }: Common & { tag: string }) {
  const { t, type } = useT()
  const tel = item.phone?.replace(/[^\d+]/g, '')
  return (
    <div className="rounded-2xl border border-pri bg-sel px-3.5 py-3" data-testid="pin">
      <div className="text-xs font-bold uppercase tracking-wide text-pri">{tag}</div>
      <div className="mt-0.5 flex items-start gap-2.5">
        <div className="flex-1 text-[19px] font-bold leading-tight">{item.name || type(item.type)}</div>
        <div className="whitespace-nowrap text-right text-xl font-extrabold leading-none">
          {fmtDist(item.d)}<small className="mt-1 block text-[12.5px] font-medium text-mut">~{walkMins(item.d)} {t('min')}</small>
        </div>
      </div>
      <Details layer={layer} item={item} live={live} />
      <Button
        render={<a href={walkUrl(item.lat, item.lon)} target="_blank" rel="noopener" />}
        nativeButton={false}
        onClick={onWalk}
        className={`${press} mt-2.5 flex min-h-[52px] items-center justify-center rounded-[14px] bg-pri text-[17px] font-bold text-onpri no-underline hov:brightness-110`}
      >{t('walkThere')}</Button>
      <div className="flex flex-wrap items-center gap-x-3.5">
        <a className="inline-flex min-h-11 items-center text-[12.5px] text-mut underline hov:text-fg" href={reportUrl(item)} target="_blank" rel="noopener">{t('report')}</a>
        {tel && <a className="inline-flex min-h-11 items-center text-[12.5px] text-mut underline hov:text-fg" href={`tel:${tel}`}>{t('call')} {item.phone}</a>}
        <SourceInfo item={item} text={srcLabel(t, item, live)} />
      </div>
    </div>
  )
}

export function ListCard({ layer, item, live, selected, onSelect, onWalk }: Common & { selected: boolean; onSelect: () => void }) {
  const { t, type } = useT()
  return (
    <li
      data-id={item.id}
      onClick={e => { if (!(e.target as HTMLElement).closest('a,button')) onSelect() }}
      className={`grid cursor-pointer grid-cols-[12px_1fr_auto] gap-x-2.5 border-b border-line px-3.5 py-3 ${selected ? 'bg-sel' : ''} hov:bg-sel`}
    >
      <span className="mt-[5px] h-3 w-3 rounded-full" style={{ background: layer.color }} />
      <div>
        <div className="text-[15px] font-semibold leading-tight">{item.name || type(item.type)}</div>
        <Details layer={layer} item={item} live={live} />
      </div>
      <div className="whitespace-nowrap text-right text-sm font-bold">{fmtDist(item.d)}<small className="block text-xs font-normal text-mut">~{walkMins(item.d)} {t('min')}</small></div>
      <div className="col-span-2 col-start-2 mt-0.5 flex flex-wrap items-center gap-x-3.5">
        <Button
          render={<a href={walkUrl(item.lat, item.lon)} target="_blank" rel="noopener" />}
          nativeButton={false}
          onClick={onWalk}
          className={`${press} inline-flex min-h-11 items-center justify-center rounded-[10px] border border-pri px-3.5 text-sm font-semibold text-pri no-underline hov:bg-sel`}
        >{t('walkThere')}</Button>
        <a className="inline-flex min-h-11 items-center text-[12.5px] text-mut underline hov:text-fg" href={reportUrl(item)} target="_blank" rel="noopener">{t('report')}</a>
        <SourceInfo item={item} text={srcLabel(t, item, live)} />
      </div>
    </li>
  )
}
