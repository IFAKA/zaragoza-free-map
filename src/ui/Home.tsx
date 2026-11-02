import { Button } from '@base-ui/react/button'
import { Collapsible } from '@base-ui/react/collapsible'
import { LAYERS, MORE, ORDER } from '../layers'
import type { LayerId } from '../lib/types'
import { press } from './cls'
import { useT } from './lang'

function Need({ id, small, onPick }: { id: LayerId; small?: boolean; onPick: (id: LayerId) => void }) {
  const { lang } = useT()
  const L = LAYERS[id]
  return (
    <Button
      onClick={() => onPick(id)}
      data-layer={id}
      style={{ borderLeftColor: L.color }}
      className={`${press} flex flex-col justify-center rounded-2xl border border-l-[6px] border-line bg-chip px-3.5 text-left text-fg hov:bg-sel ${small ? 'min-h-14 flex-row items-center gap-2.5' : 'min-h-20 items-start gap-0.5 py-2.5'}`}
    >
      <span aria-hidden className={small ? 'text-[22px] leading-none' : 'text-[26px] leading-none'}>{L.icon}</span>
      <span className={small ? 'text-[15px] font-bold' : 'text-[17px] font-bold leading-tight'}>{L.label[lang]}</span>
      {!small && <span className="text-xs leading-tight text-mut">{L.hint[lang]}</span>}
    </Button>
  )
}

/** First screen: the 4 urgent needs as big buttons, with "More" for the rest. */
export function Home({ onPick, locating, located, onLocate }: { onPick: (id: LayerId) => void; locating: boolean; located: boolean; onLocate: () => void }) {
  const { t } = useT()
  return (
    <div>
      {located
        ? <div className="mb-2.5 mt-1.5 text-[12.5px] text-mut">{t('locOk')}</div>
        : <Button onClick={onLocate} disabled={locating} className={`${press} mb-2.5 mt-1.5 min-h-12 w-full rounded-xl bg-pri text-base font-bold text-onpri disabled:opacity-60 hov:brightness-110`}>{locating ? t('nearing') : t('near')}</Button>}
      <div className="grid grid-cols-2 gap-2.5" role="group">
        {ORDER.map(id => <Need key={id} id={id} onPick={onPick} />)}
      </div>
      <Collapsible.Root>
        <Collapsible.Trigger className={`${press} mt-1.5 flex min-h-12 w-full items-center justify-center gap-1 text-[15px] font-semibold text-pri`}>
          {t('more')}<span aria-hidden className="text-xs">▾</span>
        </Collapsible.Trigger>
        <Collapsible.Panel className="origin-top transition-[opacity,transform] duration-[180ms] ease-snap data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[ending-style]:scale-100">
          <div className="grid grid-cols-2 gap-2.5 pb-1 pt-0.5">
            {MORE.map(id => <Need key={id} id={id} small onPick={onPick} />)}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  )
}
