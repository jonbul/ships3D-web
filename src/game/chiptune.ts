/**
 * The game's sounds made the way handheld consoles made theirs: square and
 * triangle waves and noise, shaped by envelopes, worked out in code rather
 * than read from files. The same sounds as the Nintendo 3DS client's. Each is
 * mono samples from -1 to 1, at SAMPLE_RATE.
 */

/** The sounds' samples a second: enough for chiptune. */
export const SAMPLE_RATE = 32000

/** A wave's shape at a phase from 0 to 1. */
type Wave = (phase: number) => number

function square(duty: number): Wave {
  return (phase) => (phase < duty ? 1 : -1)
}

const triangle: Wave = (phase) => 4 * Math.abs(phase - 0.5) - 1

const sine: Wave = (phase) => Math.sin(2 * Math.PI * phase)

/** A small seeded random number generator (mulberry32), so a sound is the same every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** An envelope from 1 to 0, quick at first, with a short rise so it doesn't click. */
function decay(share: number): number {
  const rise = 0.02
  if (share < rise) {
    return share / rise
  }
  const left = 1 - share
  return left * left
}

/** A note whose frequency slides from one to another while its loudness falls. */
function sweep(
  shape: Wave,
  from: number,
  to: number,
  seconds: number,
  volume: number,
): Float32Array {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE))
  let phase = 0
  for (let index = 0; index < samples.length; index++) {
    const share = index / samples.length
    const frequency = from * Math.pow(to / from, share) // even in pitch, as the ear hears
    phase = (phase + frequency / SAMPLE_RATE) % 1
    samples[index] = volume * shape(phase) * decay(share)
  }
  return samples
}

/**
 * A burst of noise whose brightness falls with its loudness: low-passed more
 * and more, as an explosion's crack turns into a rumble.
 */
function noise(seconds: number, volume: number, brightness: number, seed: number): Float32Array {
  const random = seeded(seed)
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE))
  let filtered = 0
  for (let index = 0; index < samples.length; index++) {
    const share = index / samples.length
    const smoothing = brightness * (1 - 0.9 * share)
    filtered += smoothing * (random() * 2 - 1 - filtered)
    samples[index] = volume * filtered * decay(share)
  }
  return samples
}

/** Sounds added together, sample by sample, each kept within -1 and 1. */
function mix(...parts: Float32Array[]): Float32Array {
  const mixed = new Float32Array(Math.max(...parts.map((part) => part.length)))
  for (const part of parts) {
    part.forEach((sample, index) => (mixed[index]! += sample))
  }
  return mixed.map((sample) => Math.max(-1, Math.min(1, sample)))
}

/** Sounds played one after another. */
function chain(...parts: Float32Array[]): Float32Array {
  const joined = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    joined.set(part, at)
    at += part.length
  }
  return joined
}

/** The game's effects, by name. */
export const effects = {
  /** A shot: a square wave diving from high to low. */
  laser: () => sweep(square(0.25), 1600, 260, 0.14, 0.32),
  /** A bullet striking a ship: a crack of noise over a short low thump. */
  hit: () => mix(noise(0.09, 0.5, 0.9, 3), sweep(triangle, 220, 70, 0.12, 0.6)),
  /** A ship blowing up: a long rumble of noise and a falling growl. */
  explosion: () => mix(noise(1.1, 0.75, 0.6, 7), sweep(square(0.5), 160, 35, 0.8, 0.25)),
  /** The force field answering a crash: a deep bump and a bright shimmer falling away. */
  shield: () => mix(sweep(sine, 150, 60, 0.35, 0.7), sweep(triangle, 1400, 500, 0.5, 0.18)),
  /** A choice changing in a menu. */
  move: () => sweep(square(0.5), 880, 880, 0.04, 0.22),
  /** A choice taken: two rising notes. */
  choose: () =>
    chain(sweep(square(0.5), 660, 660, 0.05, 0.22), sweep(square(0.5), 990, 990, 0.08, 0.22)),
  /** Going back: two falling notes. */
  back: () =>
    chain(sweep(square(0.5), 990, 990, 0.05, 0.2), sweep(square(0.5), 600, 600, 0.08, 0.2)),
}

/** The name of one of the game's effects. */
export type Effect = keyof typeof effects

// The music: a loop in the style of a handheld shooter, at 128 beats a minute in
// sixteenth notes, four chords of two bars each in A minor (Am, F, C, G).
const BEATS_PER_MINUTE = 128
const STEPS_PER_BEAT = 4
const STEPS_PER_CHORD = 32
const CHORDS = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
] as const

function frequencyOf(semitones: number): number {
  return 440 * Math.pow(2, semitones / 12)
}

/**
 * The music's whole loop, about 15 seconds: a triangle bass, a square
 * arpeggio and a noise hi-hat on the off-beats. Played on a loop, it never
 * ends.
 */
export function music(): Float32Array {
  const stepSamples = Math.floor((SAMPLE_RATE * 60) / (BEATS_PER_MINUTE * STEPS_PER_BEAT))
  const steps = CHORDS.length * STEPS_PER_CHORD
  const samples = new Float32Array(stepSamples * steps)
  const random = seeded(1)
  const arpeggioShape = square(0.25)
  let bassPhase = 0
  let arpeggioPhase = 0
  let hat = 0
  for (let step = 0; step < steps; step++) {
    const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length]!
    // The bass plays the chord's root on each beat, an octave down on the off-beats.
    const bassNote = chord[0] - 24 - (Math.floor(step / 2) % 2 === 1 ? 12 : 0)
    const bassStep = frequencyOf(bassNote) / SAMPLE_RATE
    // The arpeggio climbs the chord's notes, an octave up every other bar.
    const arpeggioNote = chord[step % 3]! + 12 * (Math.floor(step / 16) % 2)
    const arpeggioStep = frequencyOf(arpeggioNote) / SAMPLE_RATE
    for (let index = 0; index < stepSamples; index++) {
      const inStep = index / stepSamples
      bassPhase = (bassPhase + bassStep) % 1
      arpeggioPhase = (arpeggioPhase + arpeggioStep) % 1
      const bass = triangle(bassPhase) * 0.45 * (1 - 0.5 * inStep)
      const arpeggio = arpeggioShape(arpeggioPhase) * 0.14 * Math.max(0, 1 - 1.6 * inStep)
      let hiHat = 0
      if (step % 2 === 1 && inStep < 0.3) {
        hat += 0.8 * (random() * 2 - 1 - hat)
        hiHat = (random() * 2 - 1 - hat) * 0.08 * (1 - inStep / 0.3)
      }
      samples[step * stepSamples + index] = bass + arpeggio + hiHat
    }
  }
  return samples
}
