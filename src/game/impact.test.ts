import { describe, expect, it } from 'vitest'

import { SHAKE_SECONDS, WAVE_REACH, WAVE_SECONDS, fade, shake, waveRadius } from './impact'

describe('impacts', () => {
  it('fade from whole to nothing over their time', () => {
    expect(fade(0, 1)).toBe(1)
    expect(fade(0.5, 1)).toBeCloseTo(0.25)
    expect(fade(1, 1)).toBe(0)
    expect(fade(-0.1, 1)).toBe(0)
  })

  it('shake the camera less and less, then not at all', () => {
    const early = shake(0.05)
    const late = shake(SHAKE_SECONDS * 0.8)
    expect(Math.hypot(early.across, early.up)).toBeGreaterThan(Math.hypot(late.across, late.up))
    const over = shake(SHAKE_SECONDS)
    expect(Math.hypot(over.across, over.up)).toBe(0)
  })

  it('spread the wave fast, then slow, to its reach', () => {
    const first = waveRadius(WAVE_SECONDS / 4)
    const second = waveRadius(WAVE_SECONDS / 2) - first
    expect(first).toBeGreaterThan(second)
    expect(waveRadius(WAVE_SECONDS * 2)).toBe(WAVE_REACH)
  })
})
