<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { WS_URL } from '@/api/http'
import { listGameShips, type ShipInfo } from '@/api/projects'
import { showError } from '@/alerts'
import PixelIcon from '@/components/PixelIcon.vue'
import { Game } from '@/game/Game'
import { Hangar } from '@/game/hangar'
import { handling, setHandling } from '@/game/handling'
import { assaultIcon, backIcon, freeForAllIcon, settingsIcon, starIcon } from '@/game/pixelIcons'
import { sound, type Volumes } from '@/game/sound'
import { requestTiltPermission } from '@/game/tilt'
import { locale, t } from '@/i18n'
import { toggleFullscreen, type TouchMode } from '@/game/touchInput'
import { showAlert } from '@/alerts'
import { session } from '@/session'

const GUEST_NAME_KEY = 'ships3d.guestName'
const SHIP_KEY = 'ships3d.lastShip'
const TOUCH_MODE_KEY = 'ships3d.touchMode'
const MODE_KEY = 'ships3d.gameMode'
/** How far a finger must slide across the hangar to change ship, in CSS pixels. */
const SWIPE_PIXELS = 40

type GameMode = 'free' | 'assault'
const mode = ref<GameMode>(readStorage(MODE_KEY) === 'assault' ? 'assault' : 'free')

// A phone or tablet: its main pointer is a finger. They get on-screen
// controls (and the choice of steering by tilting the device).
const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false
const touchMode = ref<TouchMode>(readStorage(TOUCH_MODE_KEY) === 'tilt' ? 'tilt' : 'stick')

const defaults = ref<ShipInfo[]>([])
const own = ref<ShipInfo[]>([])
const selectedId = ref('')
const guestName = ref(readStorage(GUEST_NAME_KEY) ?? '')
const playing = ref(false)
/** Where the Play page is: choosing the mode, then the ship. */
const step = ref<'title' | 'mode' | 'ship'>('title')
const settingsOpen = ref(false)
const space = ref<HTMLElement | null>(null)
let hangar: Hangar | null = null
let resizeObserver: ResizeObserver | null = null
const gameContainer = ref<HTMLElement | null>(null)
const volumes = ref<Volumes>({ ...sound.currentVolumes })
const invertPitch = ref(handling.invertPitch)
const precision = ref(handling.precision)
let game: Game | null = null

const allShips = computed(() => [...own.value, ...defaults.value])
const shipIndex = computed(() =>
  Math.max(
    allShips.value.findIndex((ship) => ship.id === selectedId.value),
    0,
  ),
)
const currentShip = computed(() => allShips.value[shipIndex.value])
const modes = computed(() => [
  {
    id: 'free' as const,
    icon: freeForAllIcon,
    name: t.value.play.freeForAll,
    text: t.value.play.freeForAllText,
  },
  {
    id: 'assault' as const,
    icon: assaultIcon,
    name: t.value.play.assault,
    text: t.value.play.assaultText,
  },
])

onMounted(async () => {
  openSpace()
  window.addEventListener('keydown', onKey)
  try {
    const ships = await listGameShips()
    defaults.value = ships.defaults
    own.value = ships.own
  } catch (error) {
    showError(error, t.value.play.loadFailed)
    return
  }
  const last = readStorage(SHIP_KEY)
  selectedId.value = allShips.value.some((s) => s.id === last)
    ? last!
    : (allShips.value[0]?.id ?? '')
})

onBeforeUnmount(() => {
  stop()
  closeSpace()
  window.removeEventListener('keydown', onKey)
})

watch([currentShip, step, defaults], ([ship, where]) => {
  hangar?.setPlatform(where === 'ship')
  hangar?.setFlyby(where === 'title' ? titleShip() : null)
  if (ship) {
    hangar?.show(ship.layers)
  }
})

/** The ship that crosses the title: the Kestrel, as on the 3DS, or the first built-in one. */
function titleShip() {
  const ships = defaults.value
  return (ships.find((ship) => ship.id === 'default:kestrel') ?? ships[0])?.layers ?? null
}

function leaveTitle() {
  sound.unlock()
  sound.play('choose')
  step.value = 'mode'
}

/** The live space behind the page: the hangar's scene, its platform shown when choosing a ship. */
function openSpace() {
  if (!space.value || hangar) {
    return
  }
  hangar = new Hangar()
  hangar.setPlatform(step.value === 'ship')
  hangar.setFlyby(step.value === 'title' ? titleShip() : null)
  if (currentShip.value) {
    hangar.show(currentShip.value.layers)
  }
  space.value.append(hangar.canvas)
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) {
      hangar?.resize(entry.contentRect.width, entry.contentRect.height)
    }
  })
  resizeObserver.observe(space.value)
}

/** Lets the space's drawing go: the game has a renderer of its own. */
function closeSpace() {
  resizeObserver?.disconnect()
  resizeObserver = null
  hangar?.canvas.remove()
  hangar?.dispose()
  hangar = null
}

function chooseMode(chosen: GameMode) {
  mode.value = chosen
  sound.unlock()
  sound.play('choose')
  step.value = 'ship'
}

function backToModes() {
  sound.unlock()
  sound.play('back')
  step.value = 'mode'
}

function turnShip(by: number) {
  const ships = allShips.value
  if (ships.length === 0) {
    return
  }
  selectedId.value = ships[(shipIndex.value + by + ships.length) % ships.length]!.id
  sound.unlock()
  sound.play('move')
}

/** The keyboard drives the Play page as the 3DS's cross and buttons drive its menus. */
function onKey(event: KeyboardEvent) {
  if (playing.value || settingsOpen.value || event.target instanceof HTMLInputElement) {
    return
  }
  const horizontal =
    event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : 0
  if (step.value === 'title') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      leaveTitle()
    }
    return
  }
  if (step.value === 'mode') {
    if (event.key === 'Escape') {
      step.value = 'title'
      sound.play('back')
      return
    }
    if (horizontal !== 0) {
      event.preventDefault()
      mode.value = mode.value === 'free' ? 'assault' : 'free'
      sound.unlock()
      sound.play('move')
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      chooseMode(mode.value)
    }
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    turnShip(horizontal)
  } else if (event.key === 'Escape' || event.key === 'Backspace') {
    backToModes()
  } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
    void start()
  }
}

let swipeFrom: number | null = null

function onSwipeEnd(event: PointerEvent) {
  if (swipeFrom === null || step.value !== 'ship') {
    return
  }
  const moved = event.clientX - swipeFrom
  swipeFrom = null
  if (Math.abs(moved) >= SWIPE_PIXELS) {
    turnShip(moved < 0 ? 1 : -1)
  }
}

async function start() {
  if (!selectedId.value) return
  // Browsers let a page make sound only from a click or a key: this one.
  sound.unlock()
  sound.play('choose')
  writeStorage(SHIP_KEY, selectedId.value)
  writeStorage(MODE_KEY, mode.value)
  if (!session.user) writeStorage(GUEST_NAME_KEY, guestName.value)
  if (isTouch) {
    // Full screen and (on iOS) the motion-sensor prompt are only allowed
    // during the tap itself, so both start before anything is awaited.
    const fullscreen = document.fullscreenElement
      ? Promise.resolve()
      : toggleFullscreen(document.documentElement)
    const tiltAllowed = touchMode.value === 'tilt' ? requestTiltPermission() : Promise.resolve(true)
    await fullscreen
    if (!(await tiltAllowed)) {
      showAlert('info', t.value.play.noSensors)
      setTouchMode('stick')
    }
  }
  closeSpace()
  playing.value = true
  await nextTick()
  game = new Game(gameContainer.value!, {
    // The server's own messages (errors, the guest name) in this language.
    wsUrl: `${WS_URL}${mode.value === 'assault' ? '/assault' : ''}?lang=${locale.value}`,
    assault: mode.value === 'assault',
    shipId: selectedId.value,
    name: guestName.value,
    onExit: stop,
    touch: isTouch ? { mode: touchMode.value, onModeChange: setTouchMode } : undefined,
  })
}

function setVolume(kind: keyof Volumes, event: Event) {
  volumes.value = { ...volumes.value, [kind]: Number((event.target as HTMLInputElement).value) }
  sound.unlock()
  sound.setVolumes(volumes.value)
  if (kind === 'effects') sound.play('move')
}

function setInvertPitch(event: Event) {
  invertPitch.value = (event.target as HTMLInputElement).checked
  setHandling({ invertPitch: invertPitch.value })
  sound.play('move')
}

function setPrecision(event: Event) {
  precision.value = Number((event.target as HTMLInputElement).value)
  setHandling({ precision: precision.value })
  sound.play('move')
}

function setTouchMode(mode: TouchMode) {
  touchMode.value = mode
  writeStorage(TOUCH_MODE_KEY, mode)
}

// The Game owns a render loop, a socket and window listeners that outlive
// any DOM node: it must be destroyed explicitly, or every visit leaks one.
function stop() {
  const wasPlaying = game !== null
  game?.destroy()
  game = null
  playing.value = false
  if (wasPlaying) {
    void nextTick(openSpace)
  }
}

// Per-browser conveniences only; private windows may refuse storage.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not important enough to report.
  }
}
</script>

<template>
  <div v-if="playing" ref="gameContainer" class="game-container" />

  <div
    v-else
    class="shell"
    @pointerdown="swipeFrom = $event.clientX"
    @pointerup="onSwipeEnd"
    @pointercancel="swipeFrom = null"
  >
    <div ref="space" class="space" aria-hidden="true" />

    <header class="shell-top">
      <RouterLink class="button icon-button" to="/" :aria-label="t.play.backToSite">
        <PixelIcon :picture="backIcon" />
      </RouterLink>
      <h1 class="shell-title">Ships <span>3D</span></h1>
      <button
        type="button"
        class="icon-button"
        :aria-label="t.play.settings"
        @click="settingsOpen = true"
      >
        <PixelIcon :picture="settingsIcon" />
      </button>
    </header>

    <button v-if="step === 'title'" type="button" class="title-screen" @click="leaveTitle">
      <span class="title-name">Ships <span>3D</span></span>
      <span class="title-caption">{{ t.play.titleCaption }}</span>
      <span class="title-prompt">{{ t.play.titlePrompt }}</span>
    </button>

    <section v-else-if="step === 'mode'" class="window choose-mode" :aria-label="t.play.mode">
      <h2 class="ribbon">{{ t.play.mode }}</h2>
      <div class="modes" role="radiogroup">
        <button
          v-for="option in modes"
          :key="option.id"
          type="button"
          class="mode"
          :class="{ active: mode === option.id }"
          role="radio"
          :aria-checked="mode === option.id"
          @click="chooseMode(option.id)"
          @mouseenter="mode = option.id"
        >
          <PixelIcon class="cursor" :picture="starIcon" size="1rem" />
          <PixelIcon class="mode-icon" :picture="option.icon" size="4.5rem" />
          <strong>{{ option.name }}</strong>
          <span>{{ option.text }}</span>
        </button>
      </div>
      <p class="hints">{{ t.play.modeHints }}</p>
    </section>

    <template v-else>
      <p v-if="currentShip" class="ship-name" aria-live="polite">
        <strong>{{ currentShip.name }}</strong>
        <span>{{ shipIndex + 1 }} / {{ allShips.length }}</span>
      </p>
      <button
        type="button"
        class="turn previous"
        :aria-label="t.play.previousShip"
        @click="turnShip(-1)"
      >
        <PixelIcon :picture="backIcon" size="1.6rem" />
      </button>
      <button type="button" class="turn next" :aria-label="t.play.nextShip" @click="turnShip(1)">
        <PixelIcon class="flipped" :picture="backIcon" size="1.6rem" />
      </button>

      <form class="window launch" @submit.prevent="start">
        <button
          type="button"
          class="icon-button"
          :aria-label="t.play.backToModes"
          @click="backToModes"
        >
          <PixelIcon :picture="backIcon" />
        </button>
        <label v-if="!session.user" class="guest">
          {{ t.play.yourName }}
          <input v-model="guestName" maxlength="20" :placeholder="t.play.guest" />
        </label>
        <p v-else class="muted">{{ t.play.playingAs(session.user.username) }}</p>
        <button class="primary launch-button" type="submit" :disabled="!selectedId">
          {{ t.play.launch }}
        </button>
        <p v-if="!session.user && session.loaded" class="muted small">
          {{ t.play.loginBefore }}<RouterLink to="/login">{{ t.play.loginLink }}</RouterLink
          >{{ t.play.loginAfter }}
        </p>
        <p v-else-if="session.user && !own.length" class="muted small">
          {{ t.play.ownBefore }}<RouterLink to="/projects">{{ t.play.ownLink }}</RouterLink
          >{{ t.play.ownAfter }}
        </p>
      </form>
    </template>

    <div v-if="settingsOpen" class="window settings" role="dialog" :aria-label="t.play.settings">
      <h2 class="ribbon">{{ t.play.settings }}</h2>
      <label class="volume">
        {{ t.play.effectsVolume }}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          :value="volumes.effects"
          @change="setVolume('effects', $event)"
        />
      </label>
      <label class="volume">
        {{ t.play.musicVolume }}
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          :value="volumes.music"
          @change="setVolume('music', $event)"
        />
      </label>
      <label class="switch">
        <input type="checkbox" :checked="invertPitch" @change="setInvertPitch" />
        {{ t.play.invertPitch }}
      </label>
      <label class="volume">
        {{ t.play.fineAim }}
        <input type="range" min="0" max="1" step="0.1" :value="precision" @change="setPrecision" />
      </label>
      <div v-if="isTouch" class="steer" role="radiogroup" :aria-label="t.play.steerWith">
        <span class="muted">{{ t.play.steerWith }}</span>
        <button
          type="button"
          :class="{ active: touchMode === 'stick' }"
          :aria-checked="touchMode === 'stick'"
          role="radio"
          @click="setTouchMode('stick')"
        >
          {{ t.play.stick }}
        </button>
        <button
          type="button"
          :class="{ active: touchMode === 'tilt' }"
          :aria-checked="touchMode === 'tilt'"
          role="radio"
          @click="setTouchMode('tilt')"
        >
          {{ t.play.tilt }}
        </button>
      </div>
      <button type="button" class="primary" @click="settingsOpen = false">
        {{ t.common.close }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-container {
  position: fixed;
  inset: 0;
  z-index: 100;
}
/* The Play page fills the screen, as a game's menus do, over live space. */
.shell {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  touch-action: pan-y;
}
.space {
  position: absolute;
  inset: 0;
}
.space :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.shell-top {
  position: absolute;
  top: max(0.8rem, env(safe-area-inset-top));
  left: max(0.8rem, env(safe-area-inset-left));
  right: max(0.8rem, env(safe-area-inset-right));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.shell-title {
  margin: 0;
  font-size: 1.4rem;
  text-shadow: 3px 3px 0 var(--shadow);
}
.shell-title span {
  color: var(--accent);
}
.icon-button {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
}
.ribbon {
  margin: -1rem -1rem 1rem;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: #001018;
  font-size: 1rem;
}
.window {
  position: absolute;
  padding: 1rem;
}
/* The title, as the 3DS opens: the name large over space, a ship crossing, a prompt that blinks. */
.title-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  border: none;
  background: none;
  box-shadow: none;
  font-family: var(--text-font);
}
.title-screen:active {
  transform: none;
}
.title-name {
  font-family: var(--heading-font);
  font-size: clamp(2.6rem, 10vw, 6rem);
  letter-spacing: 0.08em;
  text-shadow: 6px 6px 0 var(--shadow);
}
.title-name span {
  color: var(--accent);
}
.title-caption {
  color: var(--muted);
  font-size: 1.3rem;
}
.title-prompt {
  margin-top: 3rem;
  font-family: var(--label-font);
  font-size: 0.85rem;
  animation: blink 1.2s steps(1) infinite;
}
@keyframes blink {
  60% {
    opacity: 0;
  }
}
.choose-mode {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(42rem, calc(100% - 2rem));
}
.modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 1rem;
}
.mode {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.2rem 1rem;
  text-align: center;
  font-family: var(--text-font);
  font-size: 1.05rem;
}
.mode strong {
  font-family: var(--heading-font);
  font-size: 1rem;
}
.mode span {
  color: var(--muted);
}
.mode-icon {
  color: var(--muted);
}
.mode.active {
  border-color: var(--accent);
  box-shadow:
    0 0 0 2px var(--accent),
    var(--drop);
}
.mode.active .mode-icon {
  color: var(--accent);
}
.cursor {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  color: var(--accent);
  visibility: hidden;
  animation: bob 1.2s ease-in-out infinite;
}
.mode.active .cursor {
  visibility: visible;
}
@keyframes bob {
  50% {
    transform: translateX(3px);
  }
}
.hints {
  margin: 1rem 0 0;
  font-family: var(--label-font);
  font-size: 0.7rem;
  color: var(--muted);
  text-align: center;
}
.ship-name {
  position: absolute;
  top: calc(max(0.8rem, env(safe-area-inset-top)) + 3.6rem);
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-shadow: 3px 3px 0 var(--shadow);
}
.ship-name strong {
  font-family: var(--heading-font);
  font-size: 1.8rem;
  letter-spacing: 0.05em;
}
.ship-name span {
  font-family: var(--label-font);
  font-size: 0.75rem;
  color: var(--muted);
}
.turn {
  position: absolute;
  top: 45%;
  width: 3.2rem;
  height: 3.2rem;
  display: grid;
  place-items: center;
  padding: 0;
}
.previous {
  left: max(1rem, env(safe-area-inset-left));
}
.next {
  right: max(1rem, env(safe-area-inset-right));
}
.flipped {
  transform: scaleX(-1);
}
.launch {
  left: 50%;
  bottom: max(1rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(40rem, calc(100% - 2rem));
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.8rem;
}
.launch-button {
  margin-left: auto;
  padding: 0.8rem 1.6rem;
  font-size: 1rem;
}
.guest,
.volume {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: var(--muted);
}
.small {
  flex-basis: 100%;
  margin: 0;
}
.muted {
  color: var(--muted);
}
.settings {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(22rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  z-index: 1;
}
.switch {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.switch input {
  width: 1.2rem;
  height: 1.2rem;
  accent-color: var(--accent);
}
.steer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.steer button.active {
  border-color: var(--accent);
  color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .title-prompt,
  .cursor {
    animation: none;
  }
}
</style>
