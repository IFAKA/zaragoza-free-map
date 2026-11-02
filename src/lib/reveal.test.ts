import { describe, expect, it } from 'vitest'
import { revealDelta } from './reveal'

describe('revealDelta', () => {
  it('is 0 when the row is fully visible', () => expect(revealDelta(150, 210, 100, 500)).toBe(0))
  it('scrolls down by the minimum when the row is below', () => expect(revealDelta(480, 540, 100, 500)).toBe(48))
  it('scrolls up by the minimum when the row is above', () => expect(revealDelta(60, 120, 100, 500)).toBe(-48))
  it('treats the margin as part of the hidden zone', () => expect(revealDelta(104, 164, 100, 500)).toBe(-4))
  it('shows the start of a row taller than the view', () => expect(revealDelta(200, 900, 100, 500)).toBe(92))
})
