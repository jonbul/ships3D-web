import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'

import { FORWARD, UP } from './flight'
import { startManeuver, stepManeuver, turnedAround } from './maneuver'

const nose = (q: Quaternion) => FORWARD.clone().applyQuaternion(q)
const top = (q: Quaternion) => UP.clone().applyQuaternion(q)

/** Runs a maneuver to its end, 60 frames a second; returns how many frames it took. */
function run(m: ReturnType<typeof startManeuver>, q: Quaternion): number {
  let frames = 0
  while (stepManeuver(m, q, 1 / 60)) frames++
  return frames + 1
}

describe('maneuvers', () => {
  it('a 180° turn ends flying the other way, upright', () => {
    // Start banked and yawed, to be sure it works in the ship's own frame.
    const q = new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), 0.9)
    const before = { nose: nose(q), top: top(q) }
    const frames = run(startManeuver('turn', q), q)
    expect(frames).toBeLessThanOrEqual(40)
    expect(nose(q).dot(before.nose)).toBeCloseTo(-1)
    expect(top(q).dot(before.top)).toBeCloseTo(1)
    expect(
      q.angleTo(
        turnedAround(new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), 0.9)),
      ),
    ).toBeCloseTo(0)
  })

  it('goes up and over: halfway through the loop the nose points up', () => {
    const q = new Quaternion()
    const m = startManeuver('turn', q)
    stepManeuver(m, q, 0.6 * 0.65 * 0.5)
    expect(nose(q).y).toBeGreaterThan(0.9)
  })

  it('a barrel roll ends where it started, after rolling all the way round', () => {
    const q = new Quaternion().setFromAxisAngle(UP, 0.5)
    const start = q.clone()
    const m = startManeuver('roll', q)
    stepManeuver(m, q, 0.3)
    expect(top(q).dot(top(start))).toBeCloseTo(-1)
    expect(nose(q).dot(nose(start))).toBeCloseTo(1)
    run(m, q)
    expect(q.angleTo(start)).toBeCloseTo(0)
  })
})
