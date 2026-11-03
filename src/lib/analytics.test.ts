import { describe, expect, it } from 'vitest'
import { EVENTS, PAGE_TITLE, goatSettings, shouldLoadAnalytics, track } from './analytics'

describe('shouldLoadAnalytics', () => {
  it('loads in production with an id', () => expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: null })).toBe(true))
  it('not in development', () => expect(shouldLoadAnalytics({ prod: false, id: 'abc' })).toBe(false))
  it('not without an id', () => { expect(shouldLoadAnalytics({ prod: true })).toBe(false); expect(shouldLoadAnalytics({ prod: true, id: '' })).toBe(false) })
  it('not with Do Not Track', () => expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: '1' })).toBe(false))
  it('Do Not Track "0" or unspecified still loads', () => { expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: '0' })).toBe(true); expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: 'unspecified' })).toBe(true) })
})

describe('track', () => {
  it('sends the event name and layer only', () => {
    const calls: unknown[] = []
    ;(globalThis as unknown as { window: unknown }).window = { goatcounter: { count: (o: unknown) => calls.push(o) } }
    track('locate-granted'); track('tab', 'bizi')
    expect(calls).toEqual([{ path: 'locate-granted', title: 'locate-granted', event: true }, { path: 'tab-bizi', title: 'tab', event: true }])
    delete (globalThis as unknown as { window?: unknown }).window
  })
})

describe('events', () => {
  // every track('name'...) call in the sources, read as text
  const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  // the first quoted names in the call's arguments: track('tab', id) gives tab; track(a ? 'locate-granted' : 'locate-denied') gives both
  const used = Object.entries(files).flatMap(([f, src]) => [...src.matchAll(/\btrack\(([^()]*)\)/g)].flatMap(m => {
    const first = m[1].split(',')[0]
    return [...first.matchAll(/(?<!==\s)'([a-z-]+)'/g)].map(n => ({ f, name: n[1] }))
  }))
  it('every track() call in the app uses a name from the one typed list', () => {
    expect(used.length).toBeGreaterThan(5)
    expect(used.filter(u => !(EVENTS as readonly string[]).includes(u.name))).toEqual([])
  })
  it('no event in the list is dead: each one is sent somewhere', () => {
    const names = new Set(used.map(u => u.name))
    expect(EVENTS.filter(e => !names.has(e))).toEqual([])
  })
  it('a detail is added to the path, the title stays the event name', () => {
    const calls: { path: string; title?: string }[] = []
    ;(globalThis as unknown as { window: unknown }).window = { goatcounter: { count: (o: { path: string; title?: string }) => calls.push(o) } }
    track('tab', 'wifi'); track('settings-close', 'x'); track('lang', 'es'); track('settings-open')
    expect(calls.map(c => c.path)).toEqual(['tab-wifi', 'settings-close-x', 'lang-es', 'settings-open'])
    delete (globalThis as unknown as { window?: unknown }).window
  })
  it('page views are counted under one name in every language', () => {
    expect(JSON.parse(goatSettings())).toEqual({ title: 'Zaragoza a mano' })
    expect(PAGE_TITLE).toBe('Zaragoza a mano')
  })
})
