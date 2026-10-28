import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { edgeFaces, edgeNearness, nearestFace } from './edge'

describe('the world edge', () => {
  it('is felt only near it: 0 inside the band, 1 on the edge', () => {
    const radius = 1500
    expect(edgeNearness(new Vector3(0, 0, 0), radius)).toBe(0)
    expect(edgeNearness(new Vector3(0, 0, 1300), radius)).toBe(0)
    expect(edgeNearness(new Vector3(0, 0, 1410), radius)).toBeCloseTo(0.5)
    expect(edgeNearness(new Vector3(0, 0, 1500), radius)).toBe(1)
    expect(edgeNearness(new Vector3(0, 0, 1600), radius)).toBe(1)
  })

  it('has its nearest face under the ship', () => {
    const radius = 1500
    const faces = edgeFaces(radius)
    const ship = new Vector3(0.3, 0.2, 0.93).normalize().multiplyScalar(radius * 0.95)
    const face = nearestFace(faces, ship)!
    const middle = face[0].clone().add(face[1]).add(face[2]).divideScalar(3)
    // The face's middle points the way the ship does, within a face's width.
    expect(middle.normalize().angleTo(ship.clone().normalize())).toBeLessThan(0.1)
  })
})
