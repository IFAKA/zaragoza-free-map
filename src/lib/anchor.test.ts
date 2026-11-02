import { describe, expect, it } from 'vitest'
import { anchoredScrollTop } from './anchor'

describe('anchoredScrollTop', () => {
  it('scrolls down by the height of a card inserted above', () => {
    expect(anchoredScrollTop(300, 120, 120 + 180)).toBe(480)
  })
  it('scrolls up when the card above shrinks or goes away', () => {
    expect(anchoredScrollTop(480, 300, 120)).toBe(300)
  })
  it('does nothing when the row did not move', () => {
    expect(anchoredScrollTop(50, 200, 200)).toBe(50)
  })
  it('never goes below zero', () => {
    expect(anchoredScrollTop(40, 300, 100)).toBe(0)
  })
})
