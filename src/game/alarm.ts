/** Beeps per second at the far end of the alarm, and right before impact. */
const SLOW_INTERVAL_MS = 650
const FAST_INTERVAL_MS = 110
const BEEP_SECONDS = 0.07

/**
 * The missile alarm's sound: short beeps that come faster as the missile
 * closes in. Browsers only let a page play sound after the player has
 * clicked, tapped or pressed a key, so the audio starts on the first one;
 * before that (or without Web Audio) the alarm is silent, and the red screen
 * still warns.
 */
export class AlarmSound {
  private context: AudioContext | null = null
  private lastBeep = 0
  private readonly unlock = (): void => {
    try {
      this.context ??= new AudioContext()
      void this.context.resume()
    } catch {
      // No Web Audio: silent.
    }
  }

  constructor() {
    window.addEventListener('pointerdown', this.unlock)
    window.addEventListener('keydown', this.unlock)
  }

  /** `danger` from 0 (no alarm) to 1 (about to hit); called every frame. */
  update(danger: number, now: number): void {
    if (danger <= 0 || !this.context || this.context.state !== 'running') return
    const interval = SLOW_INTERVAL_MS + (FAST_INTERVAL_MS - SLOW_INTERVAL_MS) * danger
    if (now - this.lastBeep < interval) return
    this.lastBeep = now
    const ctx = this.context
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = 880 + 440 * danger
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + BEEP_SECONDS)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + BEEP_SECONDS)
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock)
    window.removeEventListener('keydown', this.unlock)
    void this.context?.close().catch(() => {})
    this.context = null
  }
}
