import { describe, expect, it } from 'vitest'

import { chargeFills } from './lifeBar'

describe('the life bar', () => {
  it('has a charge for each tenth of the most life, lit as far as life reaches', () => {
    expect(chargeFills(10, 10)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(chargeFills(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const half = chargeFills(55, 100)
    expect(half).toHaveLength(10)
    expect(half.slice(0, 5)).toEqual([1, 1, 1, 1, 1])
    expect(half[5]).toBeCloseTo(0.5)
    expect(half[6]).toBe(0)
  })

  it('has fewer charges when the most life is under ten', () => {
    expect(chargeFills(2, 3)).toHaveLength(3)
  })
})
