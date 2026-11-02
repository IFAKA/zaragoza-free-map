import { Button } from '@base-ui/react/button'
import { press } from './cls'
import { useT } from './lang'

/** One-line "Add to Home Screen" tip. Shown once, only after the first Walk tap. Enters with opacity + scale(.95). */
export function Hint({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  return (
    <div role="status" className="mt-2 flex items-center gap-1.5 rounded-xl bg-chip py-0.5 pl-3 text-[13px] leading-snug transition-[opacity,transform] duration-200 ease-snap starting:scale-95 starting:opacity-0 motion-reduce:starting:scale-100">
      <span className="flex-1">{t('hint')}</span>
      <Button onClick={onClose} aria-label={t('hintX')} className={`${press} h-11 w-11 flex-none rounded-full text-xl text-mut`}>×</Button>
    </div>
  )
}
