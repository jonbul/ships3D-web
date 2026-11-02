import { clamp, type Controls } from './flight'

export interface InputState extends Controls {
  fire: boolean
  /** Held for an evasive barrel roll, and for a 180° turn (acted on once per press). */
  evade: boolean
  turn: boolean
  /** Held to show the scoreboard. */
  scoreboard: boolean
  /**
   * A speed to hold, as a fraction of the maximum (negative: reverse), for
   * controls that set a speed rather than accelerate, like the on-screen
   * throttle slider. When set, the game derives `throttle` from it.
   */
  speedTarget?: number
}

/**
 * Anything that can fly a ship: keyboard + mouse (KeyboardMouseInput), the
 * on-screen controls and motion sensors of a phone (TouchInput), or several
 * at once (CombinedInput). The game only ever sees InputState.
 */
export interface InputSource {
  /** The controls for this frame. */
  read(dt: number): InputState
  dispose(): void
}

/** How far the mouse must travel, in pixels, to push the virtual stick fully. */
const MOUSE_RANGE = 250
/** How fast the virtual stick re-centres when the mouse stops, per second. */
const MOUSE_RECENTER = 2.5

/**
 * Keyboard and mouse. Clicking the game captures the mouse (pointer lock);
 * moving it then pushes a virtual stick that drifts back to centre, so a
 * small flick is a gentle turn and holding a direction keeps turning.
 */
export class KeyboardMouseInput implements InputSource {
  private readonly keys = new Set<string>()
  /**
   * Keys pressed since the last read, so a tap shorter than a frame (press
   * and release before the game looks) still counts for one-shot actions.
   */
  private readonly tapped = new Set<string>()
  private stickX = 0
  private stickY = 0
  private mouseFire = false
  private readonly cleanup: Array<() => void> = []

  /**
   * `mouse: false` leaves the mouse alone: on a touch screen, taps arrive as
   * emulated mouse events too, and must not capture the pointer or fire.
   */
  constructor(
    private readonly element: HTMLElement,
    private readonly mouse = true,
  ) {
    this.listen(window, 'keydown', this.onKeyDown)
    this.listen(window, 'keyup', this.onKeyUp)
    this.listen(window, 'blur', this.releaseAll)
    this.listen(document, 'visibilitychange', this.releaseAll)
    this.listen(document, 'mousemove', this.onMouseMove)
    this.listen(element, 'mousedown', this.onMouseDown)
    this.listen(window, 'mouseup', this.onMouseUp)
    this.listen(document, 'pointerlockchange', this.onPointerLockChange)
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element
  }

  read(dt: number): InputState {
    const decay = Math.exp(-MOUSE_RECENTER * dt)
    this.stickX *= decay
    this.stickY *= decay
    const axis = (positive: string, negative: string) =>
      (this.keys.has(positive) ? 1 : 0) - (this.keys.has(negative) ? 1 : 0)
    const state: InputState = {
      pitch: clamp(axis('ArrowUp', 'ArrowDown') + this.stickY, -1, 1),
      yaw: clamp(axis('ArrowRight', 'ArrowLeft') + this.stickX, -1, 1),
      roll: axis('KeyD', 'KeyA'),
      throttle: axis('KeyW', 'KeyS'),
      fire: this.keys.has('Space') || this.mouseFire,
      evade: this.keys.has('KeyE') || this.tapped.has('KeyE'),
      turn: this.keys.has('KeyQ') || this.tapped.has('KeyQ'),
      scoreboard: this.keys.has('Tab'),
    }
    this.tapped.clear()
    return state
  }

  dispose(): void {
    for (const remove of this.cleanup) remove()
    this.cleanup.length = 0
    if (this.locked) document.exitPointerLock()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listen(target: EventTarget, type: string, handler: (event: any) => void): void {
    target.addEventListener(type, handler as EventListener)
    this.cleanup.push(() => target.removeEventListener(type, handler as EventListener))
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) return
    // Keep the page from scrolling (arrows, space) or tabbing away.
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault()
    }
    this.keys.add(event.code)
    if (!event.repeat) this.tapped.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return
    this.stickX = clamp(this.stickX + event.movementX / MOUSE_RANGE, -1, 1)
    // Mouse up raises the nose.
    this.stickY = clamp(this.stickY - event.movementY / MOUSE_RANGE, -1, 1)
  }

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.mouse || event.button !== 0) return
    // The first click only captures the mouse; it doesn't fire.
    if (!this.locked) {
      void this.element.requestPointerLock()
      return
    }
    this.mouseFire = true
  }

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.mouseFire = false
  }

  private onPointerLockChange = (): void => {
    if (!this.locked) {
      this.stickX = this.stickY = 0
      this.mouseFire = false
    }
  }

  // A key released while the window had no focus never sends keyup: without
  // this the ship would keep turning or firing forever.
  private releaseAll = (): void => {
    this.keys.clear()
    this.mouseFire = false
  }
}

/** Several sources flying one ship: axes add up, buttons are held if any holds them. */
export class CombinedInput implements InputSource {
  constructor(private readonly sources: InputSource[]) {}

  read(dt: number): InputState {
    const state: InputState = {
      pitch: 0,
      yaw: 0,
      roll: 0,
      throttle: 0,
      fire: false,
      evade: false,
      turn: false,
      scoreboard: false,
    }
    for (const source of this.sources) {
      const s = source.read(dt)
      state.pitch += s.pitch
      state.yaw += s.yaw
      state.roll += s.roll
      state.throttle += s.throttle
      state.fire ||= s.fire
      state.evade ||= s.evade
      state.turn ||= s.turn
      state.scoreboard ||= s.scoreboard
      state.speedTarget ??= s.speedTarget
    }
    state.pitch = clamp(state.pitch, -1, 1)
    state.yaw = clamp(state.yaw, -1, 1)
    state.roll = clamp(state.roll, -1, 1)
    state.throttle = clamp(state.throttle, -1, 1)
    return state
  }

  dispose(): void {
    for (const source of this.sources) source.dispose()
  }
}
