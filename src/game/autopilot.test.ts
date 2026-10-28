import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { Autopilot } from './autopilot'
import { FORWARD, stepFlight, type FlightSettings, type FlightState } from './flight'

const settings: FlightSettings = {
  worldRadius: 1500,
  maxSpeed: 80,
  minSpeed: -20,
  acceleration: 40,
  pitchRate: 1.4,
  yawRate: 1,
  rollRate: 2.2,
}

const pulledUp = { pitch: 1, yaw: 0, roll: 0, throttle: 0 }

function facingMiddle(ship: FlightState): number {
  const ahead = FORWARD.clone().applyQuaternion(ship.quaternion)
  return ahead.dot(ship.position.clone().negate().normalize())
}

describe('the autopilot', () => {
  it('turns a ship heading out near the edge back on its own', () => {
    const ship: FlightState = {
      position: new Vector3(0, 0, 1470),
      quaternion: new Quaternion(),
      speed: 40,
    }
    const autopilot = new Autopilot()
    autopilot.controls(pulledUp, ship, settings.worldRadius, settings.maxSpeed)
    expect(autopilot.steering).toBe(true)
    for (let step = 0; step < 200 && autopilot.steering; step++) {
      const controls = autopilot.controls(pulledUp, ship, settings.worldRadius, settings.maxSpeed)
      stepFlight(ship, controls, settings, 0.05)
    }
    expect(autopilot.steering).toBe(false)
    expect(facingMiddle(ship)).toBeGreaterThanOrEqual(0.96)
  })

  it('leaves the controls alone for a ship heading in', () => {
    const ship: FlightState = {
      position: new Vector3(0, 0, 1450),
      quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      speed: 40,
    }
    const autopilot = new Autopilot()
    expect(autopilot.controls(pulledUp, ship, settings.worldRadius, settings.maxSpeed)).toBe(
      pulledUp,
    )
    expect(autopilot.steering).toBe(false)
  })
})
