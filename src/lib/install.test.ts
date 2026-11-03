import { describe, expect, it } from 'vitest'
import { canShowInstallHint, inAppBrowser, installWay } from './install'

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const ANDROID_WV = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36'
const REDDIT_ANDROID = ANDROID_WV + ' Reddit/Version 2024.45.0/Build 1'
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1'
const IOS_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const IOS_INSTAGRAM = IOS_WEBVIEW + ' Instagram 350.0.0.0'
const FB = 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0]'
const TIKTOK = ANDROID_CHROME + ' musical_ly_2024 BytedanceWebview/d8a21c6'

describe('install hint', () => {
  it('shows in normal browsers', () => {
    for (const ua of [ANDROID_CHROME, IOS_SAFARI, IOS_CHROME]) expect(canShowInstallHint({ ua, standalone: false })).toBe(true)
  })
  it('is hidden in in-app browsers', () => {
    for (const ua of [ANDROID_WV, REDDIT_ANDROID, IOS_WEBVIEW, IOS_INSTAGRAM, FB, TIKTOK]) {
      expect(inAppBrowser(ua)).toBe(true)
      expect(canShowInstallHint({ ua, standalone: false })).toBe(false)
    }
  })
  it('is hidden when already installed', () => {
    expect(canShowInstallHint({ ua: ANDROID_CHROME, standalone: true })).toBe(false)
  })
})

describe('install way', () => {
  it('tells each visitor how to install', () => {
    expect(installWay({ ua: IOS_SAFARI, standalone: false })).toBe('ios')
    expect(installWay({ ua: ANDROID_CHROME, standalone: false })).toBe('menu')
    expect(installWay({ ua: REDDIT_ANDROID, standalone: false })).toBe('browser')
    expect(installWay({ ua: ANDROID_CHROME, standalone: true })).toBeNull()
  })
})
