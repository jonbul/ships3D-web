import { describe, expect, it } from 'vitest'

import { curve, handled } from './handling'

const stick = { pitch: 0.5, yaw: -0.5, roll: 0.3, throttle: 1 }

describe('the handling', () => {
  it('softens the stick near its centre and keeps it full at the edge', () => {
    expect(curve(0.5, 0)).toBe(0.5)
    expect(curve(0.5, 1)).toBeCloseTo(0.125)
    expect(curve(1, 1)).toBe(1)
    expect(curve(-1, 0.5)).toBe(-1)
  })

  it('turns pitch the other way when up raises the nose', () => {
    expect(handled(stick, { invertPitch: true, precision: 0 }).pitch).toBe(-0.5)
    expect(handled(stick, { invertPitch: false, precision: 0 }).pitch).toBe(0.5)
  })

  it('leaves roll and throttle alone', () => {
    const shaped = handled(stick, { invertPitch: true, precision: 1 })
    expect(shaped.roll).toBe(0.3)
    expect(shaped.throttle).toBe(1)
  })
})
