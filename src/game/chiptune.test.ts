import { describe, expect, it } from 'vitest'

import { SAMPLE_RATE, effects, music, type Effect } from './chiptune'

function loudest(samples: Float32Array): number {
  return samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0)
}

describe('the chiptune sounds', () => {
  it('every effect stays within range, is heard, and ends', () => {
    for (const name of Object.keys(effects) as Effect[]) {
      const samples = effects[name]()
      expect(samples.length, name).toBeGreaterThan(0)
      expect(samples.length / SAMPLE_RATE, name).toBeLessThan(2)
      expect(loudest(samples), name).toBeGreaterThan(0.05)
      expect(loudest(samples), name).toBeLessThanOrEqual(1)
    }
  })

  it('the music is a loop of about fifteen seconds that stays within range', () => {
    const loop = music()
    expect(loop.length / SAMPLE_RATE).toBeGreaterThan(14)
    expect(loop.length / SAMPLE_RATE).toBeLessThan(16)
    expect(loudest(loop)).toBeLessThanOrEqual(1)
    expect(loudest(loop)).toBeGreaterThan(0.2)
  })
})
