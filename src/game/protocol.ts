// The websocket protocol, mirrored by hand from ships-go-3d (game/protocol.go
// and game/settings.go): change both together. Every message is one JSON
// object with a "type" field.

import type { Layer } from '@/shared/shipModel'

export type V3 = [number, number, number]
/** A rotation quaternion as [x, y, z, w] (three.js order). */
export type Q4 = [number, number, number, number]

/** The rules of the game, sent by the server in `welcome`. */
export interface Settings {
  tickRate: number
  worldRadius: number
  shipRadius: number
  maxLife: number
  maxSpeed: number
  minSpeed: number
  acceleration: number
  pitchRate: number
  yawRate: number
  rollRate: number
  bulletSpeed: number
  bulletTtlMs: number
  bulletDamage: number
  fireCooldownMs: number
  respawnDelayMs: number
  /**
   * Homing missiles: hold an enemy within lockAngle (radians) of the nose,
   * nearer than lockRange, for lockTimeMs to lock on; then one missile every
   * missileCooldownMs. A missile turns at up to missileTurnRate radians a
   * second, and runs out of fuel after missileTtlMs.
   */
  lockRange: number
  lockAngle: number
  lockTimeMs: number
  missileSpeed: number
  missileTurnRate: number
  missileTtlMs: number
  missileDamage: number
  missileCooldownMs: number
}

/**
 * The assault mode's rules, sent with each round (game/settings.go). In a
 * round, Settings.maxLife and fireCooldownMs are the attackers'.
 */
export interface AssaultRules {
  minPlayers: number
  maxPlayers: number
  lobbyWaitMs: number
  attackersPerGunner: number
  attackerLife: number
  mothershipLife: number
  mothershipRadius: number
  attackerCooldownMs: number
  gunnerCooldownMs: number
  /** Radians a second. */
  gunnerTurnRate: number
  spawnDistance: number
  roundMs: number
  resultsMs: number
}

export type Team = 'attackers' | 'gunners'

/** A gunner's turret on the mothership: +1 up on its top, -1 under it. */
export interface Seat {
  p: V3
  up: number
}

export interface ShipInfo {
  id: string
  name: string
  layers: Layer[]
}

export interface PlayerInfo {
  id: string
  /** Free text typed by a guest: only ever render it as text. */
  name: string
  guest: boolean
  ship: ShipInfo
  /** Scale that normalises the ship's design to `shipRadius`. */
  scale: number
  life: number
  dead: boolean
  kills: number
  deaths: number
  p: V3
  q: Q4
  v: V3
  /** Assault mode only. */
  team?: Team
  /** Assault mode only: an attacker's hits on the mothership. */
  hits?: number
  /** Assault mode only: a gunner's turret. */
  seat?: Seat
}

export interface PlayerState {
  id: string
  p: V3
  q: Q4
  v: V3
}

export type ServerMessage =
  | { type: 'welcome'; id: string; settings: Settings; players: PlayerInfo[] }
  | { type: 'playerJoined'; player: PlayerInfo }
  | { type: 'playerLeft'; id: string }
  | { type: 'snapshot'; players: PlayerState[] }
  | { type: 'fire'; id: string; owner: string; p: V3; d: V3 }
  | { type: 'missile'; id: string; owner: string; target: string; p: V3; d: V3 }
  | { type: 'damage'; target: string; from: string; bulletId: string; life: number }
  | { type: 'died'; target: string; from: string }
  | { type: 'respawned'; id: string; life: number; p: V3; q: Q4 }
  | { type: 'error'; message: string }
  // Assault mode (/ws/assault) only. Damage to the mothership comes as
  // `damage` with target MOTHERSHIP.
  | {
      type: 'lobby'
      id: string
      players: LobbyPlayer[]
      minPlayers: number
      maxPlayers: number
      /** Only while counting down. */
      startsInMs?: number
    }
  | {
      type: 'roundStart'
      id: string
      settings: Settings
      rules: AssaultRules
      mothership: MothershipInfo
      players: PlayerInfo[]
      endsInMs: number
    }
  | { type: 'roundOver'; winner: Team; returnInMs: number }

/** The target of a hit on the mothership, in `hit` and `damage`. */
export const MOTHERSHIP = 'mothership'

export interface LobbyPlayer {
  id: string
  /** Free text typed by a guest: only ever render it as text. */
  name: string
  guest: boolean
}

export interface MothershipInfo {
  ship: ShipInfo
  scale: number
  life: number
  maxLife: number
}

export type ClientMessage =
  | { type: 'join'; shipId: string; name: string }
  | { type: 'state'; p: V3; q: Q4; v: V3 }
  | { type: 'fire'; id: string; p: V3; d: V3 }
  /** A homing missile at the ship we locked on to (or MOTHERSHIP). */
  | { type: 'missile'; id: string; target: string; p: V3; d: V3 }
  /** One of our bullets or missiles (its id as bulletId) hit `target`. */
  | { type: 'hit'; bulletId: string; target: string }
  | { type: 'respawn' }
  /** Our ship ran into ship `with`, or into the mothership (MOTHERSHIP). */
  | { type: 'crash'; with: string }
