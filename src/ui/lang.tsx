import { createContext, useContext } from 'react'
import { DICT, typeLabel, type Key, type Lang } from '../lib/i18n'

export const LangCtx = createContext<Lang>('en')
export function useT() {
  const lang = useContext(LangCtx)
  return { lang, t: (k: Key) => DICT[lang][k], type: (type: string) => typeLabel(lang, type) }
}
