import { t } from '@/i18n'

import './game.css'

export interface HudActions {
  onLeave(): void
  onRespawn(): void
  onRadarTap(): void
  onMissile(): void
}

/** The lock-on reticle, around the target on screen. */
export interface LockView {
  /** Screen position in pixels. */
  x: number
  y: number
  /** 0 to 1 while locking on; 1 once locked. */
  progress: number
  locked: boolean
}

export interface ScoreRow {
  name: string
  kills: number
  deaths: number
  me: boolean
  /** Assault mode: the team's name, and hits on the mothership. */
  team?: string
  hits?: number
}

/** Who is in the assault lobby, and when it starts. */
export interface LobbyView {
  names: Array<{ name: string; me: boolean }>
  minPlayers: number
  maxPlayers: number
  /** Null while there aren't enough players to count down. */
  secondsLeft: number | null
}

/** A ship to point out: where it is on screen, or the edge it is beyond. */
export interface Marker {
  id: string
  name: string
  lifeFraction: number
  /** Screen position in pixels. */
  x: number
  y: number
  onScreen: boolean
  /** For off-screen markers: the direction to the ship, in radians. */
  angle: number
  /** Not a target: a teammate, or a gunner seen by an attacker. */
  other?: boolean
}

const KILL_FEED_SECONDS = 6
const KILL_FEED_MAX = 5

/**
 * The heads-up display, as plain DOM over the canvas. Player names are typed
 * by strangers, so every piece of text goes in through textContent, never
 * innerHTML.
 */
export class Hud {
  readonly root: HTMLDivElement
  private readonly lifeFill: HTMLDivElement
  private readonly speedText: HTMLSpanElement
  private readonly status: HTMLDivElement
  private readonly warning: HTMLDivElement
  private readonly feed: HTMLDivElement
  private readonly scoreboard: HTMLDivElement
  private readonly scoreBody: HTMLTableSectionElement
  private readonly death: HTMLDivElement
  private readonly deathText: HTMLParagraphElement
  private readonly respawnButton: HTMLButtonElement
  private readonly hint: HTMLDivElement
  private readonly radarLabel: HTMLButtonElement
  private radarLayout = ''
  private readonly markers = new Map<string, HTMLDivElement>()
  private readonly markerLayer: HTMLDivElement
  private readonly gauges: HTMLDivElement
  private readonly round: HTMLDivElement
  private readonly roundRole: HTMLSpanElement
  private readonly roundTime: HTMLSpanElement
  private readonly mothershipFill: HTMLDivElement
  private readonly lobby: HTMLDivElement
  private readonly lobbyCount: HTMLParagraphElement
  private readonly lobbyList: HTMLUListElement
  private readonly lobbyStatus: HTMLParagraphElement
  private readonly result: HTMLDivElement
  private readonly resultTitle: HTMLHeadingElement
  private readonly resultText: HTMLParagraphElement
  private readonly resultReturn: HTMLParagraphElement
  private readonly lock: HTMLDivElement
  private readonly lockLabel: HTMLSpanElement
  private readonly missileButton: HTMLButtonElement
  private readonly missileLabel: HTMLSpanElement
  private readonly missileWarning: HTMLDivElement
  private readonly alarm: HTMLDivElement
  private alarmLevel = -1

  /** `assault`: the assault mode's lobby, round gauges and scoreboard columns. */
  constructor(container: HTMLElement, actions: HudActions, assault = false) {
    const text = t.value.game
    this.root = el('div', 'hud')
    container.appendChild(this.root)

    // Under everything else: the whole screen glows red while a missile is
    // after us.
    this.alarm = el('div', 'hud-alarm', this.root)
    this.markerLayer = el('div', 'hud-markers', this.root)

    const top = el('div', 'hud-top', this.root)
    const leave = el('button', 'hud-leave', top)
    leave.textContent = text.leave
    leave.addEventListener('click', () => actions.onLeave())

    const gauges = el('div', 'hud-gauges', top)
    this.gauges = gauges
    const life = el('div', 'hud-life', gauges)
    this.lifeFill = el('div', 'hud-life-fill', life)
    this.speedText = el('span', 'hud-speed', gauges)

    // Assault: which team we're on, the time left, and the mothership's life.
    this.round = el('div', 'hud-round', this.root)
    this.roundRole = el('span', 'hud-round-role', this.round)
    this.roundTime = el('span', 'hud-round-time', this.round)
    const mothership = el('div', 'hud-mothership', this.round)
    el('span', '', mothership).textContent = text.mothership
    const mothershipLife = el('div', 'hud-life', mothership)
    this.mothershipFill = el('div', 'hud-life-fill', mothershipLife)

    this.feed = el('div', 'hud-feed', this.root)
    el('div', 'hud-crosshair', this.root)

    // Lock-on: a reticle closing in on the target, then the missile button
    // (pressed with a finger, or the F key).
    this.lock = el('div', 'hud-lock', this.root)
    this.lockLabel = el('span', 'hud-lock-label', this.lock)
    this.lockLabel.textContent = text.locked
    this.missileButton = el('button', 'hud-missile', this.root)
    this.missileLabel = el('span', '', this.missileButton)
    el('span', 'hud-missile-key', this.missileButton).textContent = 'F'
    // On press, not on click: a click only fires when the finger lifts.
    this.missileButton.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      actions.onMissile()
    })
    this.missileWarning = el('div', 'hud-missile-warning', this.root)
    this.missileWarning.textContent = text.missileIncoming

    this.status = el('div', 'hud-status', this.root)
    this.warning = el('div', 'hud-warning', this.root)
    this.warning.textContent = text.leavingZone

    this.hint = el('div', 'hud-hint', this.root)
    this.hint.textContent = text.hint

    // A button: tapping the radar's caption cycles its range (phones have no
    // +/- keys; it works with a mouse too).
    this.radarLabel = el('button', 'hud-radar-label', this.root)
    this.radarLabel.title = text.radarTitle
    this.radarLabel.addEventListener('click', () => actions.onRadarTap())

    this.scoreboard = el('div', 'hud-scoreboard', this.root)
    const table = el('table', '', this.scoreboard)
    const head = el('tr', '', el('thead', '', table))
    const titles = assault
      ? [text.player, text.team, text.kills, text.hits, text.deaths]
      : [text.player, text.kills, text.deaths]
    for (const title of titles) el('th', '', head).textContent = title
    this.scoreBody = el('tbody', '', table)

    this.death = el('div', 'hud-death', this.root)
    el('h2', '', this.death).textContent = text.destroyed
    this.deathText = el('p', '', this.death)
    this.respawnButton = el('button', 'primary', this.death)
    this.respawnButton.addEventListener('click', () => actions.onRespawn())

    this.lobby = el('div', 'hud-lobby', this.root)
    el('h2', '', this.lobby).textContent = text.lobbyTitle
    this.lobbyCount = el('p', 'hud-lobby-count', this.lobby)
    this.lobbyList = el('ul', '', this.lobby)
    this.lobbyStatus = el('p', 'hud-lobby-status', this.lobby)
    el('p', 'hud-lobby-hint', this.lobby).textContent = text.lobbyHint

    this.result = el('div', 'hud-result', this.root)
    this.resultTitle = el('h2', '', this.result)
    this.resultText = el('p', '', this.result)
    this.resultReturn = el('p', 'hud-result-return', this.result)

    this.warning.hidden = true
    this.scoreboard.hidden = true
    this.death.hidden = true
    this.round.hidden = true
    this.lobby.hidden = true
    this.result.hidden = true
    this.lock.hidden = true
    this.missileButton.hidden = true
    this.missileWarning.hidden = true
    this.alarm.hidden = true
    this.setStatus(text.connecting)
  }

  setLife(life: number, max: number): void {
    const fraction = Math.max(0, Math.min(1, life / max))
    this.lifeFill.style.width = `${fraction * 100}%`
    this.lifeFill.classList.toggle('low', fraction <= 0.3)
  }

  setSpeed(speed: number): void {
    this.speedText.textContent = `${Math.round(speed)} u/s`
  }

  /** A blocking message (connecting, disconnected…); null hides it. */
  setStatus(text: string | null): void {
    this.status.textContent = text ?? ''
    this.status.hidden = text === null
  }

  setBoundaryWarning(visible: boolean): void {
    this.warning.hidden = !visible
  }

  setHint(text: string): void {
    this.hint.textContent = text
  }

  setHintVisible(visible: boolean): void {
    this.hint.hidden = !visible
  }

  message(text: string): void {
    const line = el('div', 'hud-feed-line', this.feed)
    line.textContent = text
    while (this.feed.children.length > KILL_FEED_MAX) this.feed.firstElementChild?.remove()
    setTimeout(() => line.remove(), KILL_FEED_SECONDS * 1000)
  }

  showScoreboard(visible: boolean, rows: ScoreRow[] = []): void {
    this.scoreboard.hidden = !visible
    if (!visible) return
    this.scoreBody.replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement('tr')
        if (row.me) tr.className = 'me'
        const values =
          row.team === undefined
            ? [row.name, String(row.kills), String(row.deaths)]
            : [row.name, row.team, String(row.kills), String(row.hits ?? 0), String(row.deaths)]
        for (const value of values) {
          el('td', '', tr).textContent = value
        }
        return tr
      }),
    )
  }

  /** Shows the death screen; the respawn button unlocks after `seconds`. */
  showDeath(killer: string | null, secondsLeft: number): void {
    this.death.hidden = false
    const text = t.value.game
    this.deathText.textContent = killer ? text.shotDownBy(killer) : text.shipDestroyed
    const ready = secondsLeft <= 0
    this.respawnButton.disabled = !ready
    this.respawnButton.textContent = ready
      ? text.respawnNow
      : text.respawnIn(Math.ceil(secondsLeft))
  }

  hideDeath(): void {
    this.death.hidden = true
  }

  /** Hides our own life and speed: a gunner has neither. */
  setGaugesVisible(visible: boolean): void {
    this.gauges.hidden = !visible
  }

  /** The assault round's gauges; null hides them. */
  setRound(round: { role: string; secondsLeft: number; mothershipLife: number } | null): void {
    this.round.hidden = round === null
    if (!round) return
    if (this.roundRole.textContent !== round.role) this.roundRole.textContent = round.role
    const seconds = Math.max(0, Math.ceil(round.secondsLeft))
    const time = `⏱ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    if (this.roundTime.textContent !== time) this.roundTime.textContent = time
    const fraction = Math.max(0, Math.min(1, round.mothershipLife))
    this.mothershipFill.style.width = `${fraction * 100}%`
    this.mothershipFill.classList.toggle('low', fraction <= 0.3)
  }

  /** The assault lobby; null hides it. */
  setLobby(lobby: LobbyView | null): void {
    this.lobby.hidden = lobby === null
    if (!lobby) return
    const text = t.value.game
    this.lobbyCount.textContent = text.lobbyCount(lobby.names.length, lobby.maxPlayers)
    const items = lobby.names.map(({ name, me }) => {
      const li = document.createElement('li')
      li.textContent = me ? `${name} ${text.you}` : name
      if (me) li.className = 'me'
      return li
    })
    if (
      items.length !== this.lobbyList.children.length ||
      items.some((li, i) => li.textContent !== this.lobbyList.children[i]!.textContent)
    ) {
      this.lobbyList.replaceChildren(...items)
    }
    const status =
      lobby.secondsLeft === null
        ? text.lobbyWaiting(lobby.minPlayers)
        : text.lobbyStarting(Math.max(0, Math.ceil(lobby.secondsLeft)))
    if (this.lobbyStatus.textContent !== status) this.lobbyStatus.textContent = status
  }

  /** The end of an assault round; null hides it. */
  setResult(result: { title: string; text: string; secondsLeft: number } | null): void {
    this.result.hidden = result === null
    if (!result) return
    this.resultTitle.textContent = result.title
    this.resultText.textContent = result.text
    this.resultReturn.textContent = t.value.game.backToLobby(
      Math.max(0, Math.ceil(result.secondsLeft)),
    )
  }

  /**
   * Positions the radar's caption next to the radar the game draws in the
   * right-hand corner: above it at the bottom, below it at the top.
   */
  setRadar(size: number, margin: number, atTop: boolean, range: number): void {
    const layout = `${size}:${margin}:${atTop}:${range}`
    if (layout === this.radarLayout) return
    this.radarLayout = layout
    const label = this.radarLabel.style
    label.width = `${size}px`
    label.right = `${margin}px`
    label.top = atTop ? `${margin + size}px` : ''
    label.bottom = atTop ? '' : `${margin + size}px`
    this.radarLabel.textContent = `Radar · ${range} u`
  }

  /** The lock-on reticle; null hides it. */
  setLock(lock: LockView | null): void {
    this.lock.hidden = lock === null
    if (!lock) return
    // Starts wide and closes in on the target as the lock builds.
    const scale = lock.locked ? 1 : 2.2 - 1.2 * lock.progress
    this.lock.style.transform = `translate(${lock.x}px, ${lock.y}px) scale(${scale})`
    this.lock.classList.toggle('locked', lock.locked)
  }

  /**
   * The missile button, shown while locked on: ready, or the seconds until
   * the missile has reloaded. Null hides it.
   */
  setMissile(missile: { secondsLeft: number } | null): void {
    this.missileButton.hidden = missile === null
    if (!missile) return
    const text = t.value.game
    const ready = missile.secondsLeft <= 0
    const label = ready ? text.missile : text.missileReloading(Math.ceil(missile.secondsLeft))
    if (this.missileLabel.textContent !== label) this.missileLabel.textContent = label
    this.missileButton.disabled = !ready
  }

  /**
   * The missile alarm: "Missile incoming!" and the screen pulsing red, more
   * strongly and faster as `danger` goes from 0 (no missile after us: hidden)
   * to 1 (about to hit).
   */
  setMissileAlarm(danger: number): void {
    const visible = danger > 0
    this.missileWarning.hidden = !visible
    this.alarm.hidden = !visible
    if (!visible) return
    // In steps, so the animation isn't restarted every frame.
    const level = Math.round(danger * 10) / 10
    if (level === this.alarmLevel) return
    this.alarmLevel = level
    this.alarm.style.setProperty('--danger', String(level))
    this.alarm.style.animationDuration = `${0.7 - 0.5 * level}s`
  }

  setMarkers(markers: Marker[]): void {
    const seen = new Set<string>()
    for (const marker of markers) {
      seen.add(marker.id)
      let node = this.markers.get(marker.id)
      if (!node) {
        node = el('div', 'hud-marker', this.markerLayer)
        el('span', 'hud-marker-name', node)
        el('div', 'hud-marker-life', node)
        el('div', 'hud-marker-arrow', node)
        this.markers.set(marker.id, node)
      }
      const [name, life, arrow] = node.children as unknown as [
        HTMLElement,
        HTMLElement,
        HTMLElement,
      ]
      if (name.textContent !== marker.name) name.textContent = marker.name
      life.style.setProperty('--life', String(marker.lifeFraction))
      node.classList.toggle('offscreen', !marker.onScreen)
      node.classList.toggle('other', marker.other === true)
      node.style.transform = `translate(${marker.x}px, ${marker.y}px)`
      arrow.style.transform = `rotate(${marker.angle}rad)`
    }
    for (const [id, node] of this.markers) {
      if (!seen.has(id)) {
        node.remove()
        this.markers.delete(id)
      }
    }
  }

  destroy(): void {
    this.root.remove()
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (parent) parent.appendChild(node)
  return node
}
