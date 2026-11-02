import { Quaternion, Vector3 } from 'three'

/**
 * Scripted maneuvers that take over the stick for a moment:
 *
 * - 'roll': an evasive barrel roll, a full turn about the nose. Done with an
 *   enemy missile close behind, it shakes the missile off.
 * - 'turn': a 180° turn, as an Immelmann: half a loop (nose up and over),
 *   then half a roll to come out upright, flying back the way we came.
 *
 * Both are quick, and the ship keeps its speed. They are pure functions over
 * the flight's quaternion, like stepFlight.
 */
export type ManeuverKind = 'roll' | 'turn'

export interface Maneuver {
  kind: ManeuverKind
  /** Seconds since it started. */
  elapsed: number
  /** The orientation it started from, to end exactly where it should. */
  start: Quaternion
}

export const ROLL_SECONDS = 0.6
export const TURN_SECONDS = 0.6
/** The part of the turn spent on the half loop; the rest is the half roll. */
const TURN_LOOP_PART = 0.65

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const step = new Quaternion()
const half = new Quaternion()

export function startManeuver(kind: ManeuverKind, quaternion: Quaternion): Maneuver {
  return { kind, elapsed: 0, start: quaternion.clone() }
}

export function maneuverSeconds(kind: ManeuverKind): number {
  return kind === 'roll' ? ROLL_SECONDS : TURN_SECONDS
}

/**
 * Sets `quaternion` to where the maneuver has the ship after dt more
 * seconds. Returns false once it is over (the ship then flies on as usual).
 */
export function stepManeuver(m: Maneuver, quaternion: Quaternion, dt: number): boolean {
  m.elapsed += dt
  const t = Math.min(1, m.elapsed / maneuverSeconds(m.kind))
  quaternion.copy(m.start)
  if (m.kind === 'roll') {
    // Rolling right, as the D key does (positive about the nose).
    quaternion.multiply(step.setFromAxisAngle(Z, 2 * Math.PI * ease(t)))
  } else {
    // Nose up is a negative rotation about X (see stepFlight).
    const loop = Math.min(1, t / TURN_LOOP_PART)
    quaternion.multiply(step.setFromAxisAngle(X, -Math.PI * ease(loop)))
    if (t > TURN_LOOP_PART) {
      const roll = (t - TURN_LOOP_PART) / (1 - TURN_LOOP_PART)
      quaternion.multiply(half.setFromAxisAngle(Z, Math.PI * ease(roll)))
    }
  }
  quaternion.normalize()
  return t < 1
}

/** Starts and ends gently. */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/** The orientation a 180° turn ends in: the same, turned round about its own up. */
export function turnedAround(quaternion: Quaternion): Quaternion {
  return quaternion.clone().multiply(step.setFromAxisAngle(Y, Math.PI))
}
