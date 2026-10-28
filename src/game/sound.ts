import { SAMPLE_RATE, effects, music, type Effect } from './chiptune'

/** Where the volumes are remembered, in the browser. */
const EFFECTS_KEY = 'ships3d.effectsVolume'
const MUSIC_KEY = 'ships3d.musicVolume'
/** The volumes a first visit starts with, from 0 to 1. */
const DEFAULT_EFFECTS = 0.8
const DEFAULT_MUSIC = 0.5
/** The music under the effects, and the engine under the shots. */
const MUSIC_LEVEL = 0.55
const ENGINE_LEVEL = 0.5

// The engine's hum: a low triangle and a square an octave and a fifth over it,
// with a rush of noise, all rising with the throttle. Frequencies in hertz.
const ENGINE_IDLE_FREQUENCY = 42
const ENGINE_FULL_FREQUENCY = 120
const ENGINE_IDLE_VOLUME = 0.16
const ENGINE_FULL_VOLUME = 0.42
/** How long the engine's pitch and loudness take to follow the throttle, in seconds. */
const ENGINE_GLIDE = 0.35

/** The volumes of the effects and of the music, from 0 to 1. */
export interface Volumes {
  effects: number
  music: number
}

/** The volumes remembered in this browser, or the defaults. */
export function loadVolumes(): Volumes {
  return {
    effects: readNumber(EFFECTS_KEY, DEFAULT_EFFECTS),
    music: readNumber(MUSIC_KEY, DEFAULT_MUSIC),
  }
}

/** Remembers the volumes in this browser. */
export function saveVolumes(volumes: Volumes): void {
  try {
    localStorage.setItem(EFFECTS_KEY, String(volumes.effects))
    localStorage.setItem(MUSIC_KEY, String(volumes.music))
  } catch {
    // A browser that keeps nothing (a private window) plays on at these volumes.
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key) ?? NaN)
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback
  } catch {
    return fallback
  }
}

/**
 * The engine's pitch, in hertz, and loudness, from 0 to 1, at a throttle from
 * 0 (idle) to 1 (full): both rise with it. Silent when not flying.
 */
export function engineAt(
  flying: boolean,
  throttle: number,
): { frequency: number; loudness: number } {
  const share = Math.min(Math.max(throttle, 0), 1)
  const frequency = ENGINE_IDLE_FREQUENCY + (ENGINE_FULL_FREQUENCY - ENGINE_IDLE_FREQUENCY) * share
  if (!flying) {
    return { frequency, loudness: 0 }
  }
  return {
    frequency,
    loudness:
      (ENGINE_IDLE_VOLUME + (ENGINE_FULL_VOLUME - ENGINE_IDLE_VOLUME) * share) * ENGINE_LEVEL,
  }
}

/** The engine's sound: its voices and their loudness. */
interface Engine {
  low: OscillatorNode
  high: OscillatorNode
  gain: GainNode
}

/**
 * The game's sound through the Web Audio API: the effects made once as
 * buffers, the music on a loop and the engine's hum. Browsers let a page make
 * sound only after a click or a key, so it starts silent and `unlock` (called
 * from one) wakes it.
 */
export class Sound {
  private context: AudioContext | null = null
  private readonly buffers = new Map<Effect, AudioBuffer>()
  private effectsGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private engine: Engine | null = null
  private volumes = loadVolumes()

  /** Wakes the sound; call it from a click or a key press. Without Web Audio it stays silent. */
  unlock(): void {
    if (!this.context) {
      if (typeof AudioContext === 'undefined') {
        return
      }
      this.context = new AudioContext()
      this.effectsGain = this.context.createGain()
      this.musicGain = this.context.createGain()
      this.effectsGain.connect(this.context.destination)
      this.musicGain.connect(this.context.destination)
      this.applyVolumes()
    }
    void this.context.resume()
  }

  /** Plays an effect, at a share of the effects' volume. */
  play(effect: Effect, volume = 1): void {
    const context = this.context
    if (!context || !this.effectsGain || this.volumes.effects === 0) {
      return
    }
    const source = context.createBufferSource()
    source.buffer = this.buffer(effect)
    const gain = context.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(this.effectsGain)
    source.start()
  }

  /** Starts the music on a loop, or stops it. */
  playMusic(playing: boolean): void {
    const context = this.context
    if (!playing || !context || !this.musicGain) {
      this.musicSource?.stop()
      this.musicSource = null
      return
    }
    if (this.musicSource) {
      return
    }
    this.musicSource = context.createBufferSource()
    this.musicSource.buffer = this.toBuffer(music())
    this.musicSource.loop = true
    this.musicSource.connect(this.musicGain)
    this.musicSource.start()
  }

  /**
   * The engine's hum while flying, at a throttle from 0 (idle) to 1 (full);
   * silent when not flying.
   */
  runEngine(flying: boolean, throttle: number): void {
    const context = this.context
    if (!context || !this.effectsGain) {
      return
    }
    const engine = (this.engine ??= this.startEngine(context, this.effectsGain))
    const { frequency, loudness } = engineAt(flying, throttle)
    const now = context.currentTime
    engine.low.frequency.setTargetAtTime(frequency, now, ENGINE_GLIDE)
    engine.high.frequency.setTargetAtTime(frequency * 3, now, ENGINE_GLIDE)
    engine.gain.gain.setTargetAtTime(loudness, now, ENGINE_GLIDE / 3)
  }

  /** Sets and remembers the volumes. */
  setVolumes(volumes: Volumes): void {
    this.volumes = volumes
    saveVolumes(volumes)
    this.applyVolumes()
  }

  /** The volumes now. */
  get currentVolumes(): Volumes {
    return this.volumes
  }

  /** Stops the music and the engine, for when the game ends. */
  stop(): void {
    this.playMusic(false)
    this.engine?.gain.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, 0.05)
  }

  private applyVolumes(): void {
    this.effectsGain?.gain.setValueAtTime(this.volumes.effects, 0)
    this.musicGain?.gain.setValueAtTime(this.volumes.music * MUSIC_LEVEL, 0)
  }

  private buffer(effect: Effect): AudioBuffer {
    let buffer = this.buffers.get(effect)
    if (!buffer) {
      buffer = this.toBuffer(effects[effect]())
      this.buffers.set(effect, buffer)
    }
    return buffer
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const buffer = this.context!.createBuffer(1, samples.length, SAMPLE_RATE)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    return buffer
  }

  /** The engine's voices, made once and left running, silent until flying. */
  private startEngine(context: AudioContext, output: GainNode): Engine {
    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(output)
    const low = context.createOscillator()
    low.type = 'triangle'
    const high = context.createOscillator()
    high.type = 'square'
    const highShare = context.createGain()
    highShare.gain.value = 0.25
    low.connect(gain)
    high.connect(highShare).connect(gain)
    // The rush: a second of noise on a loop, low-passed.
    const noise = context.createBufferSource()
    const rush = new Float32Array(SAMPLE_RATE)
    for (let index = 0; index < rush.length; index++) {
      rush[index] = Math.random() * 2 - 1
    }
    noise.buffer = this.toBuffer(rush)
    noise.loop = true
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    const noiseShare = context.createGain()
    noiseShare.gain.value = 0.35
    noise.connect(filter).connect(noiseShare).connect(gain)
    low.start()
    high.start()
    noise.start()
    return { low, high, gain }
  }
}

/** The page's one sound: one audio context for the whole game. */
export const sound = new Sound()
