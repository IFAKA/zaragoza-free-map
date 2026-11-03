/** Where the page runs, as far as the install hint cares. */
export interface InstallEnv { ua: string; /** display-mode standalone, or iOS navigator.standalone */ standalone: boolean }

const APP_TOKENS = /Reddit|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Facebook|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest|Line\//i

/** An in-app browser (a web view inside another app): nobody can add a page to the home screen from there. */
export function inAppBrowser(ua: string): boolean {
  if (/; wv\)/.test(ua)) return true // Android WebView
  if (APP_TOKENS.test(ua)) return true
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return true // iOS web view: real Safari and Chrome for iOS both say Safari/
  return false
}

/** The "add to home screen" hint is useful only in a normal browser tab, not inside another app and not when already installed. */
export const canShowInstallHint = (e: InstallEnv): boolean => !e.standalone && !inAppBrowser(e.ua)

/** Read the real environment (browser only). */
export function installEnv(): InstallEnv {
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (navigator as { standalone?: boolean }).standalone === true
  return { ua: navigator.userAgent, standalone }
}

/** The browser's own install prompt (Chrome and Edge on Android and desktop). Saved so we can open it at a good moment. */
interface InstallPrompt extends Event { prompt: () => Promise<void> }
let deferred: InstallPrompt | null = null
export function listenInstall(): void {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPrompt })
  addEventListener('appinstalled', () => { deferred = null })
}
/** Open the browser install dialog. False when the browser has none ready. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const d = deferred; deferred = null
  await d.prompt()
  return true
}
export type InstallWay = 'prompt' | 'ios' | 'browser' | 'menu'
/** How this visitor can install: the native dialog, iOS Share sheet, "open in your browser" (in-app browser), or the browser menu. */
export function installWay(e: InstallEnv): InstallWay | null {
  if (e.standalone) return null
  if (inAppBrowser(e.ua)) return 'browser'
  if (deferred) return 'prompt'
  if (/iPhone|iPad|iPod/.test(e.ua)) return 'ios'
  return 'menu'
}

/** Count this visit once per browser session (a new tab or a new day of use counts again). */
export function countVisit(): number {
  try {
    const k = 'zgz:visits'
    if (!sessionStorage.getItem('zgz:v')) { sessionStorage.setItem('zgz:v', '1'); localStorage.setItem(k, String(Number(localStorage.getItem(k) || 0) + 1)) }
    return Number(localStorage.getItem(k) || 0)
  } catch { return 0 }
}
