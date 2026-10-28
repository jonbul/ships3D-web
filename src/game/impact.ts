/**
 * What a crash into the world's edge, or a hit, looks like over time: how the
 * camera shakes, how the force field's shock wave spreads and how long the
 * struck face stays lit, each fading out. Times are in seconds.
 */

/** How long the camera shakes. */
export const SHAKE_SECONDS = 0.45
/** How far the camera moves at a crash's first moment, in world units. */
export const SHAKE_REACH = 0.9
/** How long the shock wave takes to spread to its reach. */
export const WAVE_SECONDS = 0.9
/** How far the shock wave spreads, in world units, on a world of the real size. */
export const WAVE_REACH = 320
/** How long the struck face of the force field stays lit. */
export const FLASH_SECONDS = 0.6

/**
 * How much of an effect of `duration` remains `seconds` after it began: 1 at
 * once, 0 when over, easing out.
 */
export function fade(seconds: number, duration: number): number {
  if (seconds < 0 || seconds >= duration) {
    return 0
  }
  const left = 1 - seconds / duration
  return left * left
}

/**
 * The camera's offset `seconds` after a crash, across and up: a quick wobble
 * on two axes that dies away.
 */
export function shake(seconds: number): { across: number; up: number } {
  const strength = fade(seconds, SHAKE_SECONDS) * SHAKE_REACH
  // Two frequencies that don't share a beat, so the wobble doesn't look like a circle.
  return { across: strength * Math.sin(seconds * 47), up: strength * Math.sin(seconds * 61 + 1) }
}

/**
 * How far the shock wave has spread `seconds` after a crash: fast at first,
 * slowing as it goes, as a ripple does.
 */
export function waveRadius(seconds: number): number {
  const share = Math.min(Math.max(seconds / WAVE_SECONDS, 0), 1)
  return WAVE_REACH * (1 - (1 - share) * (1 - share))
}
