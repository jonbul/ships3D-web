import {
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

import { t } from '@/i18n'
import { buildShip, scaleShip } from '@/shared/shipMesh'
import { Effects } from './effects'
import { FORWARD, UP, segmentHitsSphere, stepFlight, velocityOf, type FlightState } from './flight'
import { Hud, type Marker, type ScoreRow } from './hud'
import { Hull } from './hull'
import { CombinedInput, KeyboardMouseInput, type InputSource, type InputState } from './input'
import {
  lockProgress,
  newLock,
  stepLock,
  stepMissile,
  type LockCandidate,
  type LockState,
} from './missile'
import { Connection } from './net'
import {
  MOTHERSHIP,
  type AssaultRules,
  type LobbyPlayer,
  type MothershipInfo,
  type PlayerInfo,
  type PlayerState,
  type Q4,
  type Seat,
  type ServerMessage,
  type Settings,
  type Team,
  type V3,
} from './protocol'
import { Radar } from './radar'
import { TouchInput, type TouchMode } from './touchInput'
import { aimFrom, aimQuaternion, buildTurret, stepAim, type Aim } from './turret'
import { World } from './world'

export interface GameOptions {
  /** ships-go-3d's websocket URL. */
  wsUrl: string
  shipId: string
  /** Shown to others when playing as a guest; ignored for a logged-in user. */
  name: string
  /**
   * The assault mode: `wsUrl` is its socket, and the game waits in the
   * server's lobby before each round and after it.
   */
  assault?: boolean
  /** The player chose to leave, or the game ended (e.g. disconnected). */
  onExit(): void
  /**
   * Phone controls. Absent: keyboard and mouse only (desktop). The host
   * decides (e.g. from a coarse pointer) and may remember the mode the player
   * switches to.
   */
  touch?: {
    mode: TouchMode
    onModeChange(mode: TouchMode): void
  }
}

/** How long, in seconds, a remote ship keeps moving on its last reported velocity. */
const MAX_EXTRAPOLATION = 0.5
/** How quickly a remote ship's drawn position catches up with its reported one, per second. */
const REMOTE_SMOOTHING = 12
const CAMERA_POSITION_SMOOTHING = 6
const CAMERA_ROTATION_SMOOTHING = 8
/** Gap, in CSS pixels, between the radar and the edges of the screen. */
const RADAR_MARGIN = 16
/**
 * How strongly the ship accelerates towards a target speed (the touch
 * throttle): full thrust when this fraction of a second of acceleration away.
 */
const SPEED_TARGET_RESPONSE = 0.3
/** A ship's crash sphere, as a fraction of shipRadius (its bounding sphere). */
const CRASH_RADIUS = 0.7
/** Milliseconds between crash reports while the server hasn't agreed to one. */
const CRASH_REPORT_INTERVAL = 250

interface Ship {
  info: PlayerInfo
  group: Group
}

interface RemoteShip extends Ship {
  reported: Vector3
  reportedQuaternion: Quaternion
  velocity: Vector3
  reportedAt: number
}

interface Mothership {
  group: Group
  hull: Hull
  life: number
  maxLife: number
}

interface Lobby {
  myId: string
  players: LobbyPlayer[]
  minPlayers: number
  maxPlayers: number
  /** performance.now() time; null while not counting down. */
  startsAt: number | null
}

interface Bullet {
  mesh: Mesh
  position: Vector3
  previous: Vector3
  direction: Vector3
  expiresAt: number
}

interface Missile {
  group: Group
  position: Vector3
  previous: Vector3
  direction: Vector3
  /** The player it homes on, or MOTHERSHIP. */
  target: string
  expiresAt: number
}

/**
 * One game session: a renderer, a websocket and a loop, inside a container
 * element. It depends on nothing but three.js and the DOM - no Vue, no
 * router - so it can be embedded as is in another shell, such as a mobile
 * app's webview.
 *
 * Everything it starts (the animation loop, the socket, listeners, GPU
 * resources) is released by destroy(); the host must call it.
 */
export class Game {
  private readonly root: HTMLDivElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(70, 1, 0.5, 20000)
  private readonly hud: Hud
  private readonly input: InputSource
  private readonly connection: Connection
  private readonly effects: Effects
  private readonly resizeObserver: ResizeObserver
  private world: World | null = null
  private readonly radar = new Radar()

  private settings: Settings | null = null
  private myId = ''
  private me: Ship | null = null
  private readonly flight: FlightState = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    speed: 0,
  }
  private alive = false
  private diedAt = 0
  private killerName: string | null = null
  private readonly remotes = new Map<string, RemoteShip>()

  private readonly myBullets = new Map<string, Bullet>()
  private readonly otherBullets = new Map<string, Bullet>()
  private bulletCounter = 0
  private lastFire = 0
  private readonly myMissiles = new Map<string, Missile>()
  private readonly otherMissiles = new Map<string, Missile>()
  private readonly lock: LockState = newLock()
  /** performance.now() of our last missile; -Infinity: never fired. */
  private lastMissile = -Infinity
  /** The missile button (or F) was pressed; fired on the next frame. */
  private missileRequested = false
  private lastStateSent = 0
  private lastCrashReport = 0

  // Assault mode. A round's state is cleared by clearRound().
  private readonly assault: boolean
  private connected = false
  private lobby: Lobby | null = null
  private rules: AssaultRules | null = null
  private team: Team | null = null
  /** Ours, when we are a gunner. */
  private seat: Seat | null = null
  private readonly aim: Aim = { yaw: 0, pitch: 0 }
  private mothership: Mothership | null = null
  private roundEndsAt = 0
  private result: { winner: Team; returnAt: number } | null = null
  private readonly flightHint: string

  private frame = 0
  private lastFrameTime = 0
  private destroyed = false
  private ended = false
  private hintTimer: ReturnType<typeof setTimeout>

  constructor(
    container: HTMLElement,
    private readonly options: GameOptions,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'game-root'
    container.appendChild(this.root)

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.root.appendChild(this.renderer.domElement)

    this.assault = options.assault ?? false
    this.effects = new Effects(this.scene)
    this.hud = new Hud(
      this.root,
      {
        onLeave: () => this.exit(),
        onRespawn: () => this.requestRespawn(),
        onRadarTap: () => this.radar.cycle(),
        onMissile: () => (this.missileRequested = true),
      },
      this.assault,
    )
    this.hintTimer = setTimeout(() => this.hud.setHintVisible(false), 15000)
    if (options.touch) {
      // Phones: on-screen controls (and sensors), plus the keyboard for
      // tablets with one. The mouse is left out: taps arrive as emulated
      // mouse events too.
      this.root.classList.add('touch-layout')
      this.hud.setHint(t.value.game.touchHint)
      this.input = new CombinedInput([
        new KeyboardMouseInput(this.renderer.domElement, false),
        new TouchInput(this.root, {
          mode: options.touch.mode,
          onModeChange: options.touch.onModeChange,
          onNotice: (text) => this.hud.message(text),
        }),
      ])
    } else {
      this.input = new KeyboardMouseInput(this.renderer.domElement)
    }
    this.flightHint = options.touch ? t.value.game.touchHint : t.value.game.hint
    window.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.root)
    this.resize()

    this.connection = new Connection(options.wsUrl, {
      onOpen: () =>
        this.connection.send({ type: 'join', shipId: options.shipId, name: options.name }),
      onMessage: (message) => this.handle(message),
      // Closed before the welcome: it never connected, which is usually the
      // server being down or its certificate not trusted for this address.
      onClose: () =>
        this.end(this.connected ? t.value.game.disconnected : t.value.game.cantConnect),
    })

    this.lastFrameTime = performance.now()
    this.frame = requestAnimationFrame(this.loop)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    clearTimeout(this.hintTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.resizeObserver.disconnect()
    this.connection.close()
    this.input.dispose()
    this.hud.destroy()
    this.effects.dispose()
    this.radar.dispose()
    this.world?.dispose()
    // The mothership's and turrets' meshes are shared like ship parts.
    // Ship meshes share geometries and materials owned by shipMesh.ts,
    // which must outlive this game: only the renderer's GPU copies go.
    this.renderer.dispose()
    this.root.remove()
  }

  // --- Server messages -------------------------------------------------------

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        return this.onWelcome(message.id, message.settings, message.players)
      case 'playerJoined':
        this.addRemote(message.player)
        this.hud.message(t.value.game.joined(message.player.name))
        return
      case 'playerLeft': {
        const remote = this.remotes.get(message.id)
        if (remote) this.hud.message(t.value.game.left(remote.info.name))
        return this.removeRemote(message.id)
      }
      case 'snapshot':
        return this.onSnapshot(message.players)
      case 'fire':
        return this.onRemoteFire(message.id, message.p, message.d)
      case 'missile':
        return this.onRemoteMissile(message.id, message.target, message.p, message.d)
      case 'damage':
        return this.onDamage(message.target, message.from, message.bulletId, message.life)
      case 'died':
        return this.onDied(message.target, message.from)
      case 'respawned':
        return this.onRespawned(message.id, message.life, message.p, message.q)
      case 'error':
        return this.end(message.message)
      case 'lobby':
        return this.onLobby(message)
      case 'roundStart':
        return this.onRoundStart(message)
      case 'roundOver':
        this.result = {
          winner: message.winner,
          returnAt: performance.now() + message.returnInMs,
        }
        this.hud.hideDeath()
        return
    }
  }

  private onWelcome(id: string, settings: Settings, players: PlayerInfo[]): void {
    this.connected = true
    this.settings = settings
    this.myId = id
    this.world ??= new World(this.scene, settings.worldRadius)
    for (const player of players) {
      if (player.id === id) {
        this.me = this.createShip(player, true)
        this.team = player.team ?? null
        this.seat = player.seat ?? null
        // A gunner looks out from inside their own turret.
        if (this.seat) this.me.group.visible = false
        this.flight.position.fromArray(player.p)
        this.flight.quaternion.fromArray(player.q)
        this.flight.speed = 0
        Object.assign(this.aim, aimFrom(this.flight.quaternion))
        this.alive = !player.dead
        this.placeCameraBehind()
      } else {
        this.addRemote(player)
      }
    }
    this.hud.setStatus(null)
    this.hud.setLife(this.me?.info.life ?? 0, settings.maxLife)
    this.hud.setGaugesVisible(this.seat === null)
  }

  // --- Assault mode ----------------------------------------------------------

  private onLobby(message: Extract<ServerMessage, { type: 'lobby' }>): void {
    this.connected = true
    // Back from a round: everything in it goes.
    if (this.me || this.result) this.clearRound()
    this.lobby = {
      myId: message.id,
      players: message.players,
      minPlayers: message.minPlayers,
      maxPlayers: message.maxPlayers,
      startsAt: message.startsInMs === undefined ? null : performance.now() + message.startsInMs,
    }
    this.hud.setStatus(null)
    this.hud.setGaugesVisible(false)
    this.updateLobby(performance.now())
  }

  private updateLobby(now: number): void {
    const lobby = this.lobby
    if (!lobby) return
    this.hud.setLobby({
      names: lobby.players.map((p) => ({ name: p.name, me: p.id === lobby.myId })),
      minPlayers: lobby.minPlayers,
      maxPlayers: lobby.maxPlayers,
      secondsLeft: lobby.startsAt === null ? null : (lobby.startsAt - now) / 1000,
    })
  }

  private onRoundStart(message: Extract<ServerMessage, { type: 'roundStart' }>): void {
    this.clearRound()
    this.lobby = null
    this.hud.setLobby(null)
    this.rules = message.rules
    this.roundEndsAt = performance.now() + message.endsInMs
    this.mothership = this.createMothership(message.mothership)
    this.onWelcome(message.id, message.settings, message.players)

    const text = t.value.game
    const gunner = this.team === 'gunners'
    this.hud.message(gunner ? text.roleGunner : text.roleAttacker)
    this.hud.setHint(
      gunner ? (this.options.touch ? text.gunnerTouchHint : text.gunnerHint) : this.flightHint,
    )
    this.hud.setHintVisible(true)
    clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => this.hud.setHintVisible(false), 10000)
  }

  private createMothership(info: MothershipInfo): Mothership {
    const group = new Group()
    const model = buildShip(info.ship.layers)
    scaleShip(model, info.scale)
    group.add(model)
    this.scene.add(group)
    return {
      group,
      hull: new Hull(info.ship.layers, info.scale),
      life: info.life,
      maxLife: info.maxLife,
    }
  }

  /** Drops everything from the last round: ships, bullets, the mothership. */
  private clearRound(): void {
    if (this.me) this.scene.remove(this.me.group)
    this.me = null
    for (const id of this.remotes.keys()) this.removeRemote(id)
    for (const bullet of [...this.myBullets.values(), ...this.otherBullets.values()]) {
      this.effects.releaseBullet(bullet.mesh)
    }
    this.myBullets.clear()
    this.otherBullets.clear()
    this.clearMissiles()
    this.resetLock()
    this.lastMissile = -Infinity
    this.missileRequested = false
    if (this.mothership) this.scene.remove(this.mothership.group)
    this.mothership = null
    this.alive = false
    this.team = null
    this.seat = null
    this.result = null
    this.hud.hideDeath()
    this.hud.setResult(null)
    this.hud.setRound(null)
    this.hud.setMarkers([])
    this.hud.showScoreboard(false)
    // No ship of our own in the lobby.
    this.hud.setGaugesVisible(false)
  }

  /** Whether our bullets can hit this player: everybody in a free for all, only attackers for a gunner. */
  private isTarget(info: PlayerInfo): boolean {
    return !this.assault || (this.team === 'gunners' && info.team === 'attackers')
  }

  private resultText(winner: Team) {
    const text = t.value.game
    return {
      title: winner === this.team ? text.youWon : text.youLost,
      text: winner === 'attackers' ? text.attackersWin : text.gunnersWin,
    }
  }

  private onSnapshot(states: PlayerState[]): void {
    const now = performance.now()
    for (const state of states) {
      const remote = this.remotes.get(state.id)
      if (!remote) continue
      remote.reported.fromArray(state.p)
      remote.reportedQuaternion.fromArray(state.q)
      remote.velocity.fromArray(state.v)
      remote.reportedAt = now
    }
  }

  private onRemoteFire(id: string, p: V3, d: V3): void {
    // A hidden tab renders nothing, so bullets would only pile up and then
    // all fly at once on return (a lesson from the 2D game).
    if (document.hidden || !this.settings) return
    const position = new Vector3().fromArray(p)
    const direction = new Vector3().fromArray(d).normalize()
    this.otherBullets.set(id, {
      mesh: this.effects.bullet(false, position, direction),
      position,
      previous: position.clone(),
      direction,
      expiresAt: performance.now() + this.settings.bulletTtlMs,
    })
  }

  private onRemoteMissile(id: string, target: string, p: V3, d: V3): void {
    if (document.hidden || !this.settings) return
    const position = new Vector3().fromArray(p)
    const direction = new Vector3().fromArray(d).normalize()
    this.otherMissiles.set(id, {
      group: this.effects.missile(false, position, direction),
      position,
      previous: position.clone(),
      direction,
      target,
      expiresAt: performance.now() + this.settings.missileTtlMs,
    })
  }

  private onDamage(target: string, from: string, bulletId: string, life: number): void {
    const bullet = this.otherBullets.get(bulletId)
    if (bullet) {
      this.effects.releaseBullet(bullet.mesh)
      this.otherBullets.delete(bulletId)
    }
    const missile = this.otherMissiles.get(bulletId)
    if (missile) {
      this.effects.releaseMissile(missile.group)
      this.otherMissiles.delete(bulletId)
    }
    if (target === MOTHERSHIP) {
      if (!this.mothership) return
      this.mothership.life = life
      const shooter = from === this.myId ? this.me : this.remotes.get(from)
      if (shooter) shooter.info.hits = (shooter.info.hits ?? 0) + 1
      // Our own hits sparked when the bullet struck; others' spark now.
      const struck = bullet?.position ?? missile?.position
      if (struck && !document.hidden) this.effects.explosion(struck, missile ? 6 : 2.5, 0xffe082)
      return
    }
    const ship = target === this.myId ? this.me : this.remotes.get(target)
    if (!ship) return
    ship.info.life = life
    if (ship === this.me && this.settings) this.hud.setLife(life, this.settings.maxLife)
    if (!document.hidden) {
      this.effects.explosion(ship.group.position, missile ? 5 : 1.5, missile ? 0xff8a3d : 0xffe082)
    }
  }

  private onDied(target: string, from: string): void {
    const victim = target === this.myId ? this.me : this.remotes.get(target)
    const killer = from === this.myId ? this.me : this.remotes.get(from)
    if (killer) killer.info.kills++
    if (!victim) return
    victim.info.deaths++
    victim.info.dead = true
    victim.group.visible = false
    if (!document.hidden && this.settings) {
      this.effects.explosion(victim.group.position, this.settings.shipRadius * 3)
    }
    this.hud.message(
      killer
        ? `${killer.info.name} ✹ ${victim.info.name}`
        : t.value.game.wasDestroyed(victim.info.name),
    )
    if (victim === this.me) {
      this.alive = false
      this.resetLock()
      this.diedAt = performance.now()
      this.flight.speed = 0
      this.killerName = killer?.info.name ?? null
    }
  }

  private onRespawned(id: string, life: number, p: V3, q: Q4): void {
    if (id === this.myId && this.me) {
      this.me.info.life = life
      this.me.info.dead = false
      this.flight.position.fromArray(p)
      this.flight.quaternion.fromArray(q)
      this.flight.speed = 0
      this.alive = true
      this.me.group.visible = true
      this.placeCameraBehind()
      this.hud.hideDeath()
      if (this.settings) this.hud.setLife(life, this.settings.maxLife)
      return
    }
    const remote = this.remotes.get(id)
    if (!remote) return
    remote.info.life = life
    remote.info.dead = false
    remote.reported.fromArray(p)
    remote.reportedQuaternion.fromArray(q)
    remote.velocity.set(0, 0, 0)
    remote.reportedAt = performance.now()
    // Appear at the spawn point, rather than sliding there from the wreck.
    remote.group.position.copy(remote.reported)
    remote.group.quaternion.copy(remote.reportedQuaternion)
    remote.group.visible = true
  }

  // --- Ships -----------------------------------------------------------------

  /**
   * `withLights` makes the ship's lights shine, not just glow: only for the
   * player's own ship, since every light in the scene makes every ship dearer
   * to draw.
   */
  private createShip(info: PlayerInfo, withLights = false): Ship {
    let group: Group
    if (info.seat) {
      // Twice a fighter's size: the mothership is huge next to them.
      group = buildTurret((this.settings?.shipRadius ?? 4) * 2)
    } else {
      group = new Group()
      const model = buildShip(info.ship.layers, withLights)
      scaleShip(model, info.scale)
      group.add(model)
    }
    group.position.fromArray(info.p)
    group.quaternion.fromArray(info.q)
    group.visible = !info.dead
    this.scene.add(group)
    return { info, group }
  }

  private addRemote(info: PlayerInfo): void {
    if (info.id === this.myId || this.remotes.has(info.id)) return
    const ship = this.createShip(info)
    this.remotes.set(info.id, {
      ...ship,
      reported: new Vector3().fromArray(info.p),
      reportedQuaternion: new Quaternion().fromArray(info.q),
      velocity: new Vector3().fromArray(info.v),
      reportedAt: performance.now(),
    })
  }

  private removeRemote(id: string): void {
    const remote = this.remotes.get(id)
    if (!remote) return
    this.scene.remove(remote.group)
    this.remotes.delete(id)
  }

  // --- Loop ------------------------------------------------------------------

  private loop = (time: number): void => {
    if (this.destroyed) return
    this.frame = requestAnimationFrame(this.loop)
    // Capped, so a frame after a long stall (or a background tab) doesn't
    // teleport everything.
    const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1)
    this.lastFrameTime = time
    if (this.settings && this.me) this.update(dt, time, this.settings, this.me)
    else this.updateLobby(time)
    this.renderer.render(this.scene, this.camera)
    if (this.me) {
      const size = this.radarSize()
      const x = this.root.clientWidth - size - RADAR_MARGIN
      // Bottom right, except on phones, where the fire button lives: there
      // it goes top right. The renderer counts y from the bottom.
      const top = this.options.touch !== undefined
      const y = top ? this.root.clientHeight - size - RADAR_MARGIN : RADAR_MARGIN
      this.radar.render(this.renderer, x, y, size)
      this.hud.setRadar(size, RADAR_MARGIN, top, this.radar.range)
    }
  }

  /** The radar's side in CSS pixels: about a quarter of the short side of the screen. */
  private radarSize(): number {
    const short = Math.min(this.root.clientWidth, this.root.clientHeight)
    const min = this.options.touch ? 90 : 110
    return Math.round(Math.min(210, Math.max(min, short * 0.26)))
  }

  /** Where every live enemy is, for the radar. */
  private *contacts(): Generator<Vector3> {
    if (this.mothership && this.team === 'attackers') yield this.mothership.group.position
    for (const remote of this.remotes.values()) {
      if (!remote.info.dead && this.isTarget(remote.info)) yield remote.group.position
    }
  }

  private update(dt: number, now: number, settings: Settings, me: Ship): void {
    const input = this.input.read(dt)

    if (this.result) {
      // The round is over: nothing more to fly or shoot.
      this.hud.setResult({
        ...this.resultText(this.result.winner),
        secondsLeft: (this.result.returnAt - now) / 1000,
      })
    } else if (this.seat) {
      this.aimTurret(input, dt, now, this.seat, settings, me)
    } else if (this.alive) {
      if (input.speedTarget !== undefined) {
        // A held speed (the touch throttle): accelerate towards it, easing
        // off as it gets close.
        const gap = input.speedTarget * settings.maxSpeed - this.flight.speed
        input.throttle = Math.max(
          -1,
          Math.min(1, gap / (settings.acceleration * SPEED_TARGET_RESPONSE)),
        )
      }
      stepFlight(this.flight, input, settings, dt)
      me.group.position.copy(this.flight.position)
      me.group.quaternion.copy(this.flight.quaternion)
      this.checkCrash(now, settings)
      if (input.fire && now - this.lastFire >= settings.fireCooldownMs) this.fire(now, settings)
      this.updateLock(dt, now, settings)
      if (now - this.lastStateSent >= 1000 / settings.tickRate) this.sendState(now)
    } else {
      const left = (this.diedAt + settings.respawnDelayMs - now) / 1000
      this.hud.showDeath(this.killerName, left)
    }

    if (this.result || !this.alive) this.resetLock()
    this.missileRequested = false

    this.updateRemotes(dt, now)
    this.updateBullets(dt, now, settings)
    this.updateMissiles(dt, now, settings)
    this.effects.update(dt)
    this.updateCamera(dt, settings)
    // The renderer would only refresh this when drawing, after the markers
    // below were projected with last frame's camera.
    this.camera.updateMatrixWorld()
    this.world?.update(this.camera.position)

    this.hud.setSpeed(this.flight.speed)
    this.hud.setBoundaryWarning(this.flight.position.length() > settings.worldRadius * 0.92)
    this.hud.setMarkers(this.markers())
    this.showLock(now, settings)
    this.radar.update(this.flight.position, this.flight.quaternion, this.contacts())
    const scores = input.scoreboard || !this.alive || this.result !== null
    this.hud.showScoreboard(scores, scores ? this.scores() : [])
    if (this.mothership) {
      this.hud.setRound({
        role: this.team === 'gunners' ? t.value.game.gunner : t.value.game.attacker,
        secondsLeft: this.result ? 0 : (this.roundEndsAt - now) / 1000,
        mothershipLife: this.mothership.life / this.mothership.maxLife,
      })
    }
  }

  /**
   * Running into another ship, or into the mothership, destroys us (and the
   * other ship). We report it and the server decides: its own record of
   * where both were must agree, and it sends the deaths. Ship sizes are
   * their bounding spheres, which overstate most designs, so only a solid
   * overlap counts.
   */
  private checkCrash(now: number, settings: Settings): void {
    if (now - this.lastCrashReport < CRASH_REPORT_INTERVAL) return
    const r = settings.shipRadius * CRASH_RADIUS
    const position = this.flight.position
    let target: string | null = null
    if (this.mothership?.hull.sphereHits(position, r)) target = MOTHERSHIP
    for (const [id, remote] of this.remotes) {
      if (target) break
      // Gunners sit in the hull: running into one is running into the hull.
      if (remote.info.dead || remote.info.seat) continue
      if (remote.group.position.distanceToSquared(position) <= 4 * r * r) target = id
    }
    if (!target) return
    this.lastCrashReport = now
    this.connection.send({ type: 'crash', with: target })
  }

  /** A gunner: the turret stays in its seat and only turns. */
  private aimTurret(
    input: InputState,
    dt: number,
    now: number,
    seat: Seat,
    settings: Settings,
    me: Ship,
  ): void {
    stepAim(this.aim, input, this.rules?.gunnerTurnRate ?? 1.5, dt)
    aimQuaternion(this.aim, this.flight.quaternion)
    this.flight.position.fromArray(seat.p)
    this.flight.speed = 0
    me.group.position.copy(this.flight.position)
    me.group.quaternion.copy(this.flight.quaternion)
    const cooldown = this.rules?.gunnerCooldownMs ?? settings.fireCooldownMs
    if (input.fire && now - this.lastFire >= cooldown) this.fire(now, settings)
    this.updateLock(dt, now, settings)
    if (now - this.lastStateSent >= 1000 / settings.tickRate) this.sendState(now)
  }

  private sendState(now: number): void {
    this.lastStateSent = now
    const velocity = velocityOf(this.flight)
    this.connection.send({
      type: 'state',
      p: this.flight.position.toArray() as V3,
      q: this.flight.quaternion.toArray() as Q4,
      v: velocity.toArray() as V3,
    })
  }

  private fire(now: number, settings: Settings): void {
    this.lastFire = now
    const direction = FORWARD.clone().applyQuaternion(this.flight.quaternion)
    const position = this.flight.position
      .clone()
      .addScaledVector(direction, settings.shipRadius * 1.2)
    const id = String(++this.bulletCounter)
    this.myBullets.set(id, {
      mesh: this.effects.bullet(true, position, direction),
      position,
      previous: position.clone(),
      direction,
      expiresAt: now + settings.bulletTtlMs,
    })
    this.connection.send({
      type: 'fire',
      id,
      p: position.toArray() as V3,
      d: direction.toArray() as V3,
    })
  }

  // --- Lock-on and missiles ----------------------------------------------------

  /** Everything we may lock on to: the enemies our bullets can hit. */
  private *lockCandidates(settings: Settings): Generator<LockCandidate> {
    if (this.mothership && this.team === 'attackers') {
      yield {
        id: MOTHERSHIP,
        position: this.mothership.group.position,
        radius: this.rules?.mothershipRadius ?? 0,
      }
    }
    for (const [id, remote] of this.remotes) {
      if (remote.info.dead || !this.isTarget(remote.info)) continue
      yield { id, position: remote.group.position, radius: settings.shipRadius }
    }
  }

  private readonly nose = new Vector3()

  /** Locks on to whatever we keep ahead, and fires a missile if asked to. */
  private updateLock(dt: number, now: number, settings: Settings): void {
    const nose = this.nose.copy(FORWARD).applyQuaternion(this.flight.quaternion)
    stepLock(
      this.lock,
      this.flight.position,
      nose,
      this.lockCandidates(settings),
      settings,
      dt * 1000,
    )
    if (
      this.missileRequested &&
      this.lock.locked &&
      this.lock.target &&
      now - this.lastMissile >= settings.missileCooldownMs
    ) {
      this.launchMissile(now, settings, this.lock.target)
    }
  }

  private resetLock(): void {
    Object.assign(this.lock, newLock())
  }

  private launchMissile(now: number, settings: Settings, target: string): void {
    this.lastMissile = now
    const direction = FORWARD.clone().applyQuaternion(this.flight.quaternion)
    const position = this.flight.position
      .clone()
      .addScaledVector(direction, settings.shipRadius * 1.2)
    const id = `m${++this.bulletCounter}`
    this.myMissiles.set(id, {
      group: this.effects.missile(true, position, direction),
      position,
      previous: position.clone(),
      direction,
      target,
      expiresAt: now + settings.missileTtlMs,
    })
    this.connection.send({
      type: 'missile',
      id,
      target,
      p: position.toArray() as V3,
      d: direction.toArray() as V3,
    })
  }

  /** Where a missile's target is now, as drawn here; null once it is gone or dead. */
  private missileTarget(target: string): Vector3 | null {
    if (target === MOTHERSHIP) return this.mothership?.group.position ?? null
    if (target === this.myId) return this.alive ? this.flight.position : null
    const remote = this.remotes.get(target)
    return remote && !remote.info.dead ? remote.group.position : null
  }

  /**
   * Flies every missile after its target. Ours are hit-tested against their
   * target as drawn here, as bullets are; others' just vanish when they get
   * there, and the damage message tells what they did.
   */
  private updateMissiles(dt: number, now: number, settings: Settings): void {
    let incoming = false
    for (const [mine, missiles] of [
      [true, this.myMissiles],
      [false, this.otherMissiles],
    ] as const) {
      for (const [id, missile] of missiles) {
        const target = this.missileTarget(missile.target)
        missile.previous.copy(missile.position)
        stepMissile(missile, target, settings, dt)
        this.effects.moveMissile(missile.group, missile.position, missile.direction, dt)
        let struck = false
        if (target && missile.target === MOTHERSHIP) {
          struck = this.mothership?.hull.segmentHits(missile.previous, missile.position) ?? false
        } else if (target) {
          struck = segmentHitsSphere(
            missile.previous,
            missile.position,
            target,
            settings.shipRadius,
          )
        }
        if (!mine && missile.target === this.myId && target) incoming = true
        if (struck && mine) {
          this.connection.send({ type: 'hit', bulletId: id, target: missile.target })
          if (!document.hidden) this.effects.explosion(missile.position, 6, 0xff8a3d)
        }
        if (struck || now > missile.expiresAt) {
          this.effects.releaseMissile(missile.group)
          missiles.delete(id)
        }
      }
    }
    this.hud.setMissileWarning(incoming)
  }

  private clearMissiles(): void {
    for (const missile of [...this.myMissiles.values(), ...this.otherMissiles.values()]) {
      this.effects.releaseMissile(missile.group)
    }
    this.myMissiles.clear()
    this.otherMissiles.clear()
    this.hud.setMissileWarning(false)
  }

  /** The lock reticle around the target, and the missile button once locked. */
  private showLock(now: number, settings: Settings): void {
    const target = this.lock.target ? this.missileTarget(this.lock.target) : null
    const screen = target ? this.toScreen(target) : null
    this.hud.setLock(
      screen && {
        ...screen,
        progress: lockProgress(this.lock, settings),
        locked: this.lock.locked,
      },
    )
    this.hud.setMissile(
      this.lock.locked
        ? { secondsLeft: (this.lastMissile + settings.missileCooldownMs - now) / 1000 }
        : null,
    )
  }

  /** A point's position on screen, in pixels; null when off screen or behind us. */
  private toScreen(position: Vector3): { x: number; y: number } | null {
    const p = this.projected.copy(position).project(this.camera)
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null
    return {
      x: ((p.x + 1) / 2) * this.root.clientWidth,
      y: ((1 - p.y) / 2) * this.root.clientHeight,
    }
  }

  /**
   * Moves every bullet. Our own are also hit-tested against the other ships
   * as drawn here - the shooter's view decides, and the server checks that
   * the claim is plausible before applying any damage.
   */
  private updateBullets(dt: number, now: number, settings: Settings): void {
    const step = settings.bulletSpeed * dt
    for (const [id, bullet] of this.myBullets) {
      bullet.previous.copy(bullet.position)
      bullet.position.addScaledVector(bullet.direction, step)
      bullet.mesh.position.copy(bullet.position)
      let done = now > bullet.expiresAt
      if (!done && this.team === 'attackers' && this.mothership) {
        if (this.mothership.hull.segmentHits(bullet.previous, bullet.position)) {
          this.connection.send({ type: 'hit', bulletId: id, target: MOTHERSHIP })
          if (!document.hidden) this.effects.explosion(bullet.position, 2.5, 0xffe082)
          done = true
        }
      } else if (!done) {
        for (const [targetId, remote] of this.remotes) {
          if (remote.info.dead || !this.isTarget(remote.info)) continue
          if (
            segmentHitsSphere(
              bullet.previous,
              bullet.position,
              remote.group.position,
              settings.shipRadius,
            )
          ) {
            this.connection.send({ type: 'hit', bulletId: id, target: targetId })
            done = true
            break
          }
        }
      }
      if (done) {
        this.effects.releaseBullet(bullet.mesh)
        this.myBullets.delete(id)
      }
    }
    for (const [id, bullet] of this.otherBullets) {
      bullet.position.addScaledVector(bullet.direction, step)
      bullet.mesh.position.copy(bullet.position)
      if (now > bullet.expiresAt) {
        this.effects.releaseBullet(bullet.mesh)
        this.otherBullets.delete(id)
      }
    }
  }

  private readonly predicted = new Vector3()

  /** Draws each remote ship where it probably is now, easing towards it. */
  private updateRemotes(dt: number, now: number): void {
    const blend = 1 - Math.exp(-REMOTE_SMOOTHING * dt)
    for (const remote of this.remotes.values()) {
      if (remote.info.dead) continue
      const age = Math.min((now - remote.reportedAt) / 1000, MAX_EXTRAPOLATION)
      this.predicted.copy(remote.reported).addScaledVector(remote.velocity, age)
      remote.group.position.lerp(this.predicted, blend)
      remote.group.quaternion.slerp(remote.reportedQuaternion, blend)
    }
  }

  private readonly cameraTarget = new Vector3()
  private readonly cameraEye = new Vector3()
  private readonly cameraUp = new Vector3()
  private readonly cameraMatrix = new Matrix4()
  private readonly cameraQuaternion = new Quaternion()

  /** A chase camera, above and behind the ship, rolling with it. */
  private updateCamera(dt: number, settings: Settings, snap = false): void {
    if (!this.alive && !snap) return // Watch the wreck from where we were.
    const r = settings.shipRadius
    const q = this.flight.quaternion
    if (this.seat) {
      // A gunner looks out from the top of the turret (the bottom, under
      // the hull), with the world's up: the mothership is level.
      const forward = this.cameraTarget.copy(FORWARD).applyQuaternion(q)
      this.camera.position.copy(this.flight.position).addScaledVector(UP, this.seat.up * r * 0.8)
      this.camera.up.copy(UP)
      this.camera.lookAt(this.cameraEye.copy(this.camera.position).addScaledVector(forward, 100))
      return
    }
    this.cameraEye
      .set(0, r * 1.3, -r * 3.6)
      .applyQuaternion(q)
      .add(this.flight.position)
    this.cameraTarget
      .copy(FORWARD)
      .multiplyScalar(r * 5)
      .applyQuaternion(q)
      .add(this.flight.position)
    this.cameraUp.copy(UP).applyQuaternion(q)
    this.cameraMatrix.lookAt(this.cameraEye, this.cameraTarget, this.cameraUp)
    this.cameraQuaternion.setFromRotationMatrix(this.cameraMatrix)
    if (snap) {
      this.camera.position.copy(this.cameraEye)
      this.camera.quaternion.copy(this.cameraQuaternion)
      return
    }
    this.camera.position.lerp(this.cameraEye, 1 - Math.exp(-CAMERA_POSITION_SMOOTHING * dt))
    this.camera.quaternion.slerp(
      this.cameraQuaternion,
      1 - Math.exp(-CAMERA_ROTATION_SMOOTHING * dt),
    )
  }

  private placeCameraBehind(): void {
    if (this.settings) this.updateCamera(0, this.settings, true)
  }

  private readonly projected = new Vector3()

  /**
   * Screen markers for every live enemy: a label on screen, an arrow at the
   * edge off it. In the assault, the players we can't shoot (teammates, and
   * the gunners for an attacker) get a plain label while on screen, so the
   * gunners can be told apart on the hull.
   */
  private markers(): Marker[] {
    const width = this.root.clientWidth
    const height = this.root.clientHeight
    const markers: Marker[] = []
    const targets: Array<{
      id: string
      name: string
      life: number
      position: Vector3
      other?: boolean
    }> = []
    if (this.mothership && this.team === 'attackers') {
      targets.push({
        id: MOTHERSHIP,
        name: t.value.game.mothership,
        life: this.mothership.life / this.mothership.maxLife,
        position: this.mothership.group.position,
      })
    }
    for (const [id, remote] of this.remotes) {
      if (remote.info.dead) continue
      const other = !this.isTarget(remote.info)
      if (other && !this.assault) continue
      targets.push({
        id,
        name: remote.info.seat ? `🛡 ${remote.info.name}` : remote.info.name,
        life: this.settings ? remote.info.life / this.settings.maxLife : 1,
        position: remote.group.position,
        other,
      })
    }
    for (const { id, name, life, position, other } of targets) {
      const p = this.projected.copy(position)
      p.applyMatrix4(this.camera.matrixWorldInverse)
      const behind = p.z > 0 // Camera space looks down -Z.
      p.applyMatrix4(this.camera.projectionMatrix)
      let x = p.x
      let y = p.y
      if (behind) {
        x = -x
        y = -y
      }
      const onScreen = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1
      if (other && !onScreen) continue
      const angle = Math.atan2(-y, x)
      if (!onScreen) {
        // Pin to an ellipse just inside the screen edge.
        x = Math.cos(angle) * 0.9
        y = -Math.sin(angle) * 0.85
      }
      markers.push({
        id,
        name,
        lifeFraction: life,
        x: ((x + 1) / 2) * width,
        y: ((1 - y) / 2) * height - (onScreen ? 28 : 0),
        onScreen,
        angle,
        other,
      })
    }
    return markers
  }

  private scores(): ScoreRow[] {
    const ships: Ship[] = [...(this.me ? [this.me] : []), ...this.remotes.values()]
    const text = t.value.game
    return ships
      .map((ship) => ({
        name: ship.info.name,
        kills: ship.info.kills,
        deaths: ship.info.deaths,
        me: ship === this.me,
        ...(this.assault && {
          team: ship.info.team === 'gunners' ? text.gunner : text.attacker,
          hits: ship.info.hits ?? 0,
          gunner: ship.info.team === 'gunners',
        }),
      }))
      .sort(
        (a, b) =>
          Number(a.gunner ?? 0) - Number(b.gunner ?? 0) ||
          b.kills + (b.hits ?? 0) - (a.kills + (a.hits ?? 0)) ||
          a.deaths - b.deaths,
      )
  }

  // --- Misc ------------------------------------------------------------------

  private requestRespawn(): void {
    if (!this.alive) this.connection.send({ type: 'respawn' })
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyF' && !event.repeat) this.missileRequested = true
    if (event.code === 'Enter' && !this.alive && this.settings) {
      if (performance.now() >= this.diedAt + this.settings.respawnDelayMs) this.requestRespawn()
    }
    // + zooms in (shorter range), - zooms out.
    if (event.code === 'Equal' || event.code === 'NumpadAdd') this.radar.zoomIn()
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') this.radar.zoomOut()
  }

  // Bullets drawn here move only while frames are rendered; after time in a
  // background tab they would be far from where they should be.
  private onVisibilityChange = (): void => {
    if (document.hidden) return
    for (const bullet of this.otherBullets.values()) this.effects.releaseBullet(bullet.mesh)
    this.otherBullets.clear()
    for (const missile of this.otherMissiles.values()) this.effects.releaseMissile(missile.group)
    this.otherMissiles.clear()
  }

  private end(reason: string): void {
    if (this.ended || this.destroyed) return
    this.ended = true
    this.hud.setStatus(reason)
    setTimeout(() => this.exit(), 2500)
  }

  private exit(): void {
    if (!this.destroyed) this.options.onExit()
  }

  private resize(): void {
    const width = this.root.clientWidth
    const height = this.root.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
}
