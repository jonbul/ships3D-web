import { Vector3 } from 'three'

import type { Settings } from './protocol'

/**
 * Locking on and homing missiles, as pure functions the game calls every
 * frame (and tests call directly).
 *
 * A ship locks on to an enemy by keeping it close to its nose - within
 * lockAngle, and nearer than lockRange - for lockTimeMs. The lock then holds
 * while the enemy stays roughly ahead (twice the angle, a bit more range),
 * so a target jinking across the crosshair doesn't break it at once.
 */

export type LockSettings = Pick<Settings, 'lockRange' | 'lockAngle' | 'lockTimeMs'>
export type MissileSettings = Pick<Settings, 'missileSpeed' | 'missileTurnRate'>

/** Something that can be locked on to: a ship, or the mothership. */
export interface LockCandidate {
  id: string
  position: Vector3
  /** How big it is: the mothership's edge comes into range before its centre. */
  radius: number
}

export interface LockState {
  /** The enemy being locked on to, or locked. */
  target: string | null
  /** How long, in milliseconds, it has been held in the cone. */
  heldMs: number
  locked: boolean
}

export function newLock(): LockState {
  return { target: null, heldMs: 0, locked: false }
}

/** Once locked, the lock holds within this many times the angle and range. */
const HOLD_ANGLE = 2
const HOLD_RANGE = 1.15

const offset = new Vector3()

/**
 * How far off the nose (unit vector) a candidate is, in radians, counting
 * its size; and how far away its edge is.
 */
function aimOff(
  origin: Vector3,
  nose: Vector3,
  c: LockCandidate,
): { angle: number; distance: number } {
  offset.subVectors(c.position, origin)
  const centre = offset.length()
  if (centre <= c.radius) return { angle: 0, distance: 0 }
  const angle = nose.angleTo(offset) - Math.asin(Math.min(1, c.radius / centre))
  return { angle: Math.max(0, angle), distance: centre - c.radius }
}

/** Advances the lock by dtMs, for a ship at `origin` facing `nose`. */
export function stepLock(
  lock: LockState,
  origin: Vector3,
  nose: Vector3,
  candidates: Iterable<LockCandidate>,
  s: LockSettings,
  dtMs: number,
): void {
  let best: string | null = null
  let bestAngle = Infinity
  let current: { angle: number; distance: number } | null = null
  for (const c of candidates) {
    const aim = aimOff(origin, nose, c)
    if (c.id === lock.target) current = aim
    if (aim.angle <= s.lockAngle && aim.distance <= s.lockRange && aim.angle < bestAngle) {
      best = c.id
      bestAngle = aim.angle
    }
  }

  if (lock.locked) {
    if (
      current &&
      current.angle <= s.lockAngle * HOLD_ANGLE &&
      current.distance <= s.lockRange * HOLD_RANGE
    ) {
      return
    }
    lock.locked = false
    lock.target = null
    lock.heldMs = 0
  }

  // Keep counting while the one we started on is still in the cone, even if
  // another has drifted closer to the crosshair.
  const stillIn =
    current !== null && current.angle <= s.lockAngle && current.distance <= s.lockRange
  if (!stillIn) {
    lock.target = best
    lock.heldMs = 0
    if (best === null) return
  }
  lock.heldMs += dtMs
  if (lock.heldMs >= s.lockTimeMs) lock.locked = true
}

/** How far along a lock is, from 0 to 1. */
export function lockProgress(lock: LockState, s: LockSettings): number {
  return lock.locked ? 1 : Math.min(1, lock.heldMs / s.lockTimeMs)
}

export interface MissileFlight {
  position: Vector3
  /** Unit vector: where it is heading. */
  direction: Vector3
}

const desired = new Vector3()
const axis = new Vector3()

/**
 * Flies a missile for dt seconds: it turns towards `target` (null: its
 * target is gone, so it flies straight on) at up to missileTurnRate, then
 * moves along its heading.
 */
export function stepMissile(
  missile: MissileFlight,
  target: Vector3 | null,
  s: MissileSettings,
  dt: number,
): void {
  if (target) {
    desired.subVectors(target, missile.position)
    if (desired.lengthSq() > 1e-9) {
      desired.normalize()
      const angle = missile.direction.angleTo(desired)
      const maxTurn = s.missileTurnRate * dt
      if (angle <= maxTurn) {
        missile.direction.copy(desired)
      } else {
        axis.crossVectors(missile.direction, desired)
        // Dead behind: any axis square to the heading turns it round.
        if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).cross(missile.direction)
        if (axis.lengthSq() < 1e-12) axis.set(1, 0, 0)
        missile.direction.applyAxisAngle(axis.normalize(), maxTurn).normalize()
      }
    }
  }
  missile.position.addScaledVector(missile.direction, s.missileSpeed * dt)
}
