import { t } from '@/i18n'

import { clamp } from './flight'
import type { InputSource, InputState } from './input'
import { TiltSensor, requestTiltPermission, tiltToAxis } from './tilt'

/** How a phone steers: an on-screen stick, or tilting the phone itself. */
export type TouchMode = 'stick' | 'tilt'

export interface TouchInputOptions {
  mode: TouchMode
  /** The player switched mode (the host may want to remember it). */
  onModeChange(mode: TouchMode): void
  /** Something worth telling the player (e.g. no motion sensors). */
  onNotice(text: string): void
}

const DEG = Math.PI / 180
/** Tilt below this is ignored; at TILT_FULL the ship turns at full rate. */
const TILT_DEAD_ZONE = 3 * DEG
const TILT_FULL = 25 * DEG
/** How long to wait for a first sensor reading before giving up on tilt. */
const SENSOR_TIMEOUT_MS = 1500
/** The throttle slider's range, as a fraction of top speed (bottom is reverse). */
const THROTTLE_MIN = -0.25
const THROTTLE_MAX = 1
/** The stick's travel radius, in CSS pixels. */
const STICK_RADIUS = 56
/** Must match .touch-throttle-thumb's height in game.css. */
const THUMB_HEIGHT = '2.2rem'
const STICK_DEAD_ZONE = 0.08

/**
 * Phone controls, as DOM over the game.
 *
 * Both modes share a throttle slider (left edge: it sets the speed to hold,
 * since tilting can't express speed), a fire button and two roll buttons
 * (right). Pitch and yaw come from an on-screen stick (bottom left) in
 * 'stick' mode, or from tilting the phone in 'tilt' mode. A button switches
 * between the two at any time.
 *
 * Every control tracks its own pointer (pointer capture), so the stick,
 * throttle, fire and roll can all be held at once with several fingers.
 */
export class TouchInput implements InputSource {
  private readonly root: HTMLDivElement
  private readonly stick: HTMLDivElement
  private readonly knob: HTMLDivElement
  private readonly throttleTrack: HTMLDivElement
  private readonly throttleThumb: HTMLDivElement
  private readonly modeButton: HTMLButtonElement
  private readonly recenterButton: HTMLButtonElement
  private readonly sensor = new TiltSensor()
  private readonly cleanup: Array<() => void> = []

  private mode: TouchMode = 'stick'
  private stickX = 0
  private stickY = 0
  private throttle = 0
  private rollLeft = false
  private rollRight = false
  private firing = false
  // Latched until read, so a tap shorter than a frame still counts.
  private evading = false
  private turning = false
  private scores = false
  private sensorTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    container: HTMLElement,
    private readonly options: TouchInputOptions,
  ) {
    const text = t.value.game
    this.root = el('div', 'touch-controls', container)

    // Utility buttons, under the life bar.
    const tools = el('div', 'touch-tools', this.root)
    this.modeButton = el('button', 'touch-tool', tools)
    this.on(
      this.modeButton,
      'click',
      () => void this.setMode(this.mode === 'stick' ? 'tilt' : 'stick'),
    )
    this.recenterButton = el('button', 'touch-tool', tools)
    this.recenterButton.textContent = text.recenter
    this.on(this.recenterButton, 'click', () => this.sensor.recenter())
    const scores = el('button', 'touch-tool', tools)
    scores.textContent = '🏆'
    this.hold(scores, (held) => (this.scores = held))
    const fullscreen = el('button', 'touch-tool', tools)
    fullscreen.textContent = '⛶'
    this.on(fullscreen, 'click', () => void toggleFullscreen(container))

    // Throttle slider: the finger's height sets the speed to hold, and it
    // stays there when the finger lifts.
    this.throttleTrack = el('div', 'touch-throttle', this.root)
    const zero = el('div', 'touch-throttle-zero', this.throttleTrack)
    zero.style.bottom = this.throttlePosition(0, true)
    this.throttleThumb = el('div', 'touch-throttle-thumb', this.throttleTrack)
    this.drag(this.throttleTrack, (event) => {
      const rect = this.throttleTrack.getBoundingClientRect()
      const t = clamp((rect.bottom - event.clientY) / rect.height, 0, 1)
      this.setThrottle(THROTTLE_MIN + t * (THROTTLE_MAX - THROTTLE_MIN))
    })
    this.setThrottle(0)

    // Stick: springs back to centre when released.
    this.stick = el('div', 'touch-stick', this.root)
    this.knob = el('div', 'touch-stick-knob', this.stick)
    this.drag(
      this.stick,
      (event) => {
        const rect = this.stick.getBoundingClientRect()
        let dx = event.clientX - (rect.left + rect.width / 2)
        let dy = event.clientY - (rect.top + rect.height / 2)
        const distance = Math.hypot(dx, dy)
        if (distance > STICK_RADIUS) {
          dx *= STICK_RADIUS / distance
          dy *= STICK_RADIUS / distance
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`
        this.stickX = dx / STICK_RADIUS
        // Up on the screen raises the nose, as with the mouse.
        this.stickY = -dy / STICK_RADIUS
      },
      () => {
        this.knob.style.transform = ''
        this.stickX = this.stickY = 0
      },
    )

    // Fire and roll, for the right thumb, with the evasive roll and the 180°
    // turn above them.
    const actions = el('div', 'touch-actions', this.root)
    const evade = el('button', 'touch-maneuver touch-evade', actions)
    evade.textContent = text.evade
    this.hold(evade, (held) => (this.evading ||= held))
    const turn = el('button', 'touch-maneuver touch-turn', actions)
    turn.textContent = '180°'
    turn.setAttribute('aria-label', text.turnAround)
    this.hold(turn, (held) => (this.turning ||= held))
    const rollLeft = el('button', 'touch-roll touch-roll-left', actions)
    rollLeft.textContent = '⟲'
    rollLeft.setAttribute('aria-label', text.rollLeft)
    this.hold(rollLeft, (held) => (this.rollLeft = held))
    const rollRight = el('button', 'touch-roll touch-roll-right', actions)
    rollRight.textContent = '⟳'
    rollRight.setAttribute('aria-label', text.rollRight)
    this.hold(rollRight, (held) => (this.rollRight = held))
    const fire = el('button', 'touch-fire', actions)
    fire.textContent = text.fire
    this.hold(fire, (held) => (this.firing = held))

    el('div', 'touch-rotate-hint', this.root).textContent = text.rotatePhone

    this.applyMode(options.mode)
    if (options.mode === 'tilt') this.startSensor()
  }

  read(): InputState {
    let pitch = 0
    let yaw = 0
    if (this.mode === 'tilt') {
      const tilt = this.sensor.read()
      pitch = tiltToAxis(tilt.pitch, TILT_DEAD_ZONE, TILT_FULL)
      yaw = tiltToAxis(tilt.steer, TILT_DEAD_ZONE, TILT_FULL)
    } else {
      pitch = deadZone(this.stickY)
      yaw = deadZone(this.stickX)
    }
    const state: InputState = {
      pitch,
      yaw,
      roll: (this.rollRight ? 1 : 0) - (this.rollLeft ? 1 : 0),
      throttle: 0,
      speedTarget: this.throttle,
      fire: this.firing,
      evade: this.evading,
      turn: this.turning,
      scoreboard: this.scores,
    }
    this.evading = this.turning = false
    return state
  }

  /**
   * Switches mode. Called from a tap, so on iOS the motion-sensor permission
   * prompt is allowed to appear.
   */
  async setMode(mode: TouchMode): Promise<void> {
    if (mode === 'tilt') {
      if (!(await requestTiltPermission())) {
        this.options.onNotice(t.value.game.noSensors)
        return
      }
      this.startSensor()
    } else {
      this.stopSensor()
    }
    this.applyMode(mode)
    this.options.onModeChange(mode)
  }

  dispose(): void {
    this.stopSensor()
    for (const remove of this.cleanup) remove()
    this.cleanup.length = 0
    this.root.remove()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }

  private applyMode(mode: TouchMode): void {
    this.mode = mode
    this.root.dataset.mode = mode
    const text = t.value.game
    this.modeButton.textContent = mode === 'tilt' ? text.tilt : text.stick
    this.modeButton.title = text.modeTitle
    this.recenterButton.hidden = mode !== 'tilt'
  }

  private startSensor(): void {
    this.sensor.start()
    clearTimeout(this.sensorTimer)
    // A desktop browser, or a phone without (or blocking) sensors, accepts
    // the listener and simply never calls it: fall back to the stick.
    this.sensorTimer = setTimeout(() => {
      if (this.mode === 'tilt' && !this.sensor.active) {
        this.stopSensor()
        this.applyMode('stick')
        this.options.onModeChange('stick')
        this.options.onNotice(t.value.game.noSensorReadings)
      }
    }, SENSOR_TIMEOUT_MS)
  }

  private stopSensor(): void {
    clearTimeout(this.sensorTimer)
    this.sensor.stop()
  }

  private setThrottle(value: number): void {
    this.throttle = clamp(value, THROTTLE_MIN, THROTTLE_MAX)
    this.throttleThumb.style.bottom = this.throttlePosition(this.throttle, false)
    this.throttleTrack.classList.toggle('reverse', this.throttle < 0)
  }

  /**
   * CSS `bottom` for a throttle value. The thumb travels the track's height
   * minus its own, so it never overhangs the ends; the zero mark sits at the
   * thumb's centre for that value.
   */
  private throttlePosition(value: number, centre: boolean): string {
    const t = (value - THROTTLE_MIN) / (THROTTLE_MAX - THROTTLE_MIN)
    return `calc((100% - ${THUMB_HEIGHT}) * ${t}${centre ? ` + ${THUMB_HEIGHT} / 2` : ''})`
  }

  // --- Pointer plumbing ------------------------------------------------------

  /** A control that follows one finger from press to release. */
  private drag(
    element: HTMLElement,
    move: (event: PointerEvent) => void,
    release?: () => void,
  ): void {
    let pointer: number | null = null
    this.on(element, 'pointerdown', (event: PointerEvent) => {
      if (pointer !== null) return
      pointer = event.pointerId
      element.setPointerCapture(event.pointerId)
      event.preventDefault()
      move(event)
    })
    this.on(element, 'pointermove', (event: PointerEvent) => {
      if (event.pointerId === pointer) move(event)
    })
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      pointer = null
      release?.()
    }
    this.on(element, 'pointerup', end)
    this.on(element, 'pointercancel', end)
  }

  /** A button that is "on" while pressed. */
  private hold(element: HTMLElement, set: (held: boolean) => void): void {
    this.drag(
      element,
      () => {
        set(true)
        element.classList.add('pressed')
      },
      () => {
        set(false)
        element.classList.remove('pressed')
      },
    )
  }

  private on<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
  ): void {
    target.addEventListener(type, handler as EventListener)
    this.cleanup.push(() => target.removeEventListener(type, handler as EventListener))
  }
}

function deadZone(value: number): number {
  return Math.abs(value) < STICK_DEAD_ZONE ? 0 : value
}

/**
 * Full screen, and landscape where the browser allows locking it (Android;
 * iOS Safari has neither, and ignores both).
 */
export async function toggleFullscreen(element: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await element.requestFullscreen?.({ navigationUI: 'hide' })
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>
    }
    await orientation.lock?.('landscape')
  } catch {
    // Not supported, or refused: playing in a normal window is fine.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent.appendChild(node)
  if (node instanceof HTMLButtonElement) node.type = 'button'
  return node
}
