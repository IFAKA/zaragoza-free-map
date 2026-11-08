import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Check } from '@phosphor-icons/react'
import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { useT } from './lang'

const CHOICES: { v: Theme; key: 'themeAuto' | 'themeLight' | 'themeDark' }[] = [{ v: 'auto', key: 'themeAuto' }, { v: 'light', key: 'themeLight' }, { v: 'dark', key: 'themeDark' }]

/** Three choices for the colours: Automatic (follows the phone), Light, Dark. Used in the Settings page. */
export function ThemeSwitch() {
  const { t } = useT()
  const [theme, set] = useState<Theme>(getTheme)
  return (
    <RadioGroup value={theme} onValueChange={v => { set(v as Theme); setTheme(v as Theme) }} aria-label={t('theme')} data-testid="theme">
      <div className="px-4 pb-1 pt-3 text-sm font-bold text-ink-soft">{t('theme')}</div>
      {CHOICES.map(c => (
        <Radio.Root key={c.v} value={c.v} data-testid={`theme-${c.v}`} className="flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left font-bold text-ink [transition:background-color_var(--dur-press)] hov:bg-surface">
          <span className="flex-1">{t(c.key)}</span>
          <Radio.Indicator className="text-brand-text"><Check size="1.3em" weight="bold" aria-hidden /></Radio.Indicator>
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
