import { describe, expect, it } from 'vitest'
import { shouldLoadAnalytics } from './analytics'

describe('shouldLoadAnalytics', () => {
  it('loads in production with an id', () => expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: null })).toBe(true))
  it('not in development', () => expect(shouldLoadAnalytics({ prod: false, id: 'abc' })).toBe(false))
  it('not without an id', () => { expect(shouldLoadAnalytics({ prod: true })).toBe(false); expect(shouldLoadAnalytics({ prod: true, id: '' })).toBe(false) })
  it('not with Do Not Track', () => expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: '1' })).toBe(false))
  it('Do Not Track "0" or unspecified still loads', () => { expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: '0' })).toBe(true); expect(shouldLoadAnalytics({ prod: true, id: 'abc', dnt: 'unspecified' })).toBe(true) })
})
