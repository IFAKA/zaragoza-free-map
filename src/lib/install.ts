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
