import type { Controls } from './flight'

/** Where the choices are remembered, in the browser. */
const INVERT_KEY = 'ships3d.invertPitch'
const PRECISION_KEY = 'ships3d.fineAim'
/** A first visit's fine aim, from 0 to 1: a little softer near the centre. */
const DEFAULT_PRECISION = 0.5

/**
 * How the ship answers the stick, the same choices as the 3DS client's: whether
 * up raises the nose (as a plane's stick does) or lowers it, and fine aim,
 * how much softer the stick is near its centre, from 0 to 1.
 */
export interface Handling {
  invertPitch: boolean
  precision: number
}

/** The handling remembered in this browser, or the defaults. */
export function loadHandling(): Handling {
  try {
    const precision = Number(localStorage.getItem(PRECISION_KEY) ?? NaN)
    return {
      invertPitch: localStorage.getItem(INVERT_KEY) === 'true',
      precision: Number.isFinite(precision)
        ? Math.min(Math.max(precision, 0), 1)
        : DEFAULT_PRECISION,
    }
  } catch {
    return { invertPitch: false, precision: DEFAULT_PRECISION }
  }
}

/** Remembers the handling in this browser. */
export function saveHandling(handling: Handling): void {
  try {
    localStorage.setItem(INVERT_KEY, String(handling.invertPitch))
    localStorage.setItem(PRECISION_KEY, String(handling.precision))
  } catch {
    // A browser that keeps nothing (a private window) flies on with these choices.
  }
}

/**
 * Shapes a stick's value in [-1, 1] for aiming: with precision 0 it is
 * unchanged, with 1 it is the value cubed, slow near the centre for fine aim
 * and still full at the edge (the 3DS's flight.Curve).
 */
export function curve(value: number, precision: number): number {
  const share = Math.min(Math.max(precision, 0), 1)
  return value * (1 - share) + value * value * value * share
}

/** The stick's pitch and turn shaped by the handling; roll and throttle as they are. */
export function handled<C extends Controls>(controls: C, handling: Handling): C {
  const pitch = curve(controls.pitch, handling.precision)
  return {
    ...controls,
    pitch: handling.invertPitch ? -pitch : pitch,
    yaw: curve(controls.yaw, handling.precision),
  }
}

/** The handling in use, shared by the Play page's settings and the game. */
export const handling: Handling = loadHandling()

/** Changes the handling in use and remembers it. */
export function setHandling(changed: Partial<Handling>): void {
  Object.assign(handling, changed)
  saveHandling(handling)
}
