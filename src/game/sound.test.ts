import { describe, expect, it } from 'vitest'

import { engineAt } from './sound'

describe('the engine', () => {
  it('hums higher and louder at full throttle, and is silent when not flying', () => {
    const idle = engineAt(true, 0)
    const full = engineAt(true, 1)
    expect(idle.loudness).toBeGreaterThan(0)
    expect(full.frequency).toBeGreaterThan(idle.frequency)
    expect(full.loudness).toBeGreaterThan(idle.loudness * 1.5)
    expect(engineAt(false, 1).loudness).toBe(0)
  })
})
