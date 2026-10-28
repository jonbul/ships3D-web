import { describe, expect, it } from 'vitest'

import { pixelRuns } from './pixelIcons'

describe('pixel icons', () => {
  it('are drawn as runs of the same colour along each row', () => {
    expect(pixelRuns(['.##+', '#...'])).toEqual([
      { x: 1, y: 0, width: 2, light: false },
      { x: 3, y: 0, width: 1, light: true },
      { x: 0, y: 1, width: 1, light: false },
    ])
  })
})
