import { describe, expect, it } from 'vitest'
import { shouldLoadAnalytics, track } from './analytics'

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
