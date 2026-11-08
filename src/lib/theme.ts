export type Theme = 'auto' | 'light' | 'dark'
export const THEME_KEY = 'zar-theme'
export const THEME_EVENT = 'zar-theme'

/** The saved choice. Automatic (the system decides) when nothing is saved or storage is blocked. */
export function getTheme(): Theme {
  try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}

/** Saves the choice and sets data-theme on <html> (none for automatic, so the system setting decides in the CSS). index.html sets it before first paint. */
export function setTheme(t: Theme) {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* storage blocked: the choice lasts until reload */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t)
  window.dispatchEvent(new Event(THEME_EVENT))
}

/** True when the page is dark now: the chosen theme, else the system setting. */
export const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme')
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}
