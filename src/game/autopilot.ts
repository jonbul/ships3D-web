import { Quaternion, Vector3 } from 'three'

import { edgeNearness } from './edge'
import { FORWARD, type Controls, type FlightState } from './flight'

/** How near the edge the autopilot takes the helm, when the ship heads out. */
const START_NEARNESS = 0.8
/** How squarely the ship must face the middle to get the helm back: the cosine of the angle left. */
const FACING = 0.96
/** How hard it steers toward the middle. */
const STEERING = 2.5
/** The least speed it keeps, as a share of the most, so the turn takes the ship somewhere. */
const LEAST_SPEED = 0.3

const toMiddle = new Vector3()
const ahead = new Vector3()
const inverse = new Quaternion()

/**
 * The copilot's autopilot: when the ship heads out too near the world's edge
 * it takes the helm and turns the ship back toward the middle, softly, and
 * gives the controls back once it faces inward (as Wind Waker turns the boat
 * back at the edge of its sea).
 */
export class Autopilot {
  /** Whether it has the helm now. */
  steering = false

  /**
   * The controls to fly with this frame: the player's own, or the
   * autopilot's while it has the helm.
   */
  controls(player: Controls, ship: FlightState, worldRadius: number, maxSpeed: number): Controls {
    if (ship.position.lengthSq() === 0) {
      this.steering = false
      return player
    }
    toMiddle.copy(ship.position).negate().normalize()
    ahead.copy(FORWARD).applyQuaternion(ship.quaternion)
    if (
      !this.steering &&
      edgeNearness(ship.position, worldRadius) >= START_NEARNESS &&
      ahead.dot(toMiddle) < 0
    ) {
      this.steering = true
    }
    if (!this.steering) {
      return player
    }
    // Where the middle is, as the ship sees it: +X is its left, +Y its top.
    const local = toMiddle.applyQuaternion(inverse.copy(ship.quaternion).invert())
    if (local.z >= FACING) {
      this.steering = false
      return player
    }
    let yaw = clamp(-local.x * STEERING)
    if (local.z < 0 && Math.abs(local.x) < 0.2) {
      yaw = 1 // straight behind: pick a side
    }
    return {
      pitch: clamp(local.y * STEERING),
      yaw,
      roll: 0,
      throttle: ship.speed < LEAST_SPEED * maxSpeed ? 1 : 0,
    }
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(value, -1), 1)
}
