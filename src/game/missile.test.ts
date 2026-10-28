import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'

import { FORWARD } from './flight'
import { lockProgress, newLock, stepLock, stepMissile, type LockCandidate } from './missile'

const settings = {
  lockRange: 700,
  lockAngle: 0.2,
  lockTimeMs: 2000,
  missileSpeed: 150,
  missileTurnRate: 2.5,
}

const origin = new Vector3()
const ahead = (id: string, z: number, x = 0): LockCandidate => ({
  id,
  position: new Vector3(x, 0, z),
  radius: 4,
})

/** Steps the lock for `ms` milliseconds, 100 at a time. */
function hold(lock: ReturnType<typeof newLock>, candidates: LockCandidate[], ms: number) {
  for (let t = 0; t < ms; t += 100) stepLock(lock, origin, FORWARD, candidates, settings, 100)
}

describe('stepLock', () => {
  it('locks on after holding an enemy ahead for lockTimeMs', () => {
    const lock = newLock()
    hold(lock, [ahead('a', 300)], 1500)
    expect(lock.target).toBe('a')
    expect(lock.locked).toBe(false)
    expect(lockProgress(lock, settings)).toBeCloseTo(0.75)
    hold(lock, [ahead('a', 300)], 500)
    expect(lock.locked).toBe(true)
  })

  it('ignores enemies off the nose or out of range', () => {
    const lock = newLock()
    hold(lock, [ahead('wide', 100, 100), ahead('far', 1000), ahead('behind', -100)], 3000)
    expect(lock.target).toBeNull()
    expect(lock.locked).toBe(false)
  })

  it('starts over when the enemy leaves the cone before the lock', () => {
    const lock = newLock()
    hold(lock, [ahead('a', 300)], 1500)
    hold(lock, [ahead('a', 300, 300)], 100)
    expect(lock.target).toBeNull()
    hold(lock, [ahead('a', 300)], 1500)
    expect(lock.locked).toBe(false)
  })

  it('keeps a lock a little off the nose, and loses it further out', () => {
    const lock = newLock()
    hold(lock, [ahead('a', 300)], 2000)
    // 0.3 rad off: outside the cone, inside twice it.
    hold(lock, [ahead('a', 300, 300 * Math.tan(0.3))], 1000)
    expect(lock.locked).toBe(true)
    hold(lock, [ahead('a', 300, 300)], 100)
    expect(lock.locked).toBe(false)
    expect(lock.target).toBeNull()
  })

  it('loses the lock when the target is gone', () => {
    const lock = newLock()
    hold(lock, [ahead('a', 300)], 2000)
    hold(lock, [], 100)
    expect(lock.locked).toBe(false)
  })

  it('counts a big target by its edge', () => {
    const lock = newLock()
    // The mothership: its centre is far off the nose and out of range, its hull isn't.
    hold(lock, [{ id: 'mothership', position: new Vector3(150, 0, 850), radius: 180 }], 2000)
    expect(lock.locked).toBe(true)
  })
})

describe('stepMissile', () => {
  it('turns towards its target no faster than missileTurnRate', () => {
    const missile = { position: new Vector3(), direction: FORWARD.clone() }
    stepMissile(missile, new Vector3(100, 0, 0), settings, 0.1)
    expect(missile.direction.angleTo(FORWARD)).toBeCloseTo(0.25)
    expect(missile.direction.length()).toBeCloseTo(1)
    expect(missile.position.length()).toBeCloseTo(15)
  })

  it('catches a target flying away from it', () => {
    const missile = { position: new Vector3(), direction: FORWARD.clone() }
    // A ship 200 ahead, crossing at full speed (80): the missile (150) gets it.
    const target = new Vector3(0, 0, 200)
    let hit = false
    for (let i = 0; i < 80 && !hit; i++) {
      target.x += 80 * 0.05
      stepMissile(missile, target, settings, 0.05)
      hit = missile.position.distanceTo(target) < 4
    }
    expect(hit).toBe(true)
  })

  it('flies straight on without a target', () => {
    const missile = { position: new Vector3(), direction: FORWARD.clone() }
    stepMissile(missile, null, settings, 1)
    expect(missile.position.z).toBeCloseTo(150)
    expect(missile.direction.equals(FORWARD)).toBe(true)
  })

  it('turns round for a target dead behind', () => {
    const missile = { position: new Vector3(), direction: FORWARD.clone() }
    stepMissile(missile, new Vector3(0, 0, -100), settings, 0.1)
    expect(missile.direction.angleTo(FORWARD)).toBeCloseTo(0.25)
  })
})
