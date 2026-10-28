<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import { uploadModel } from '@/api/models'
import { getProject, saveProject } from '@/api/projects'
import { showAlert, showError } from '@/alerts'
import { AXIS_COLORS, Editor, type GizmoMode, type PartRef } from '@/editor/Editor'
import { History } from '@/editor/history'
import { t } from '@/i18n'
import {
  LIMITS,
  PART_TEXTURES,
  SHAPE_TYPES,
  boundingRadius,
  DEFAULT_LIGHT,
  cloneLayers,
  isLight,
  isValidTextureUrl,
  clonePart,
  countLights,
  countParts,
  newLayer,
  newPart,
  newProject,
  validateProject,
  type Layer,
  type Part,
  type PartTexture,
  type PartType,
  type Project,
  type ShapeType,
} from '@/shared/shipModel'
import { addLoadedModel, modelState, onModelLoaded, parseModel } from '@/shared/models'
import { onUrlTextureLoaded, textureSwatch, urlTextureState } from '@/shared/textures'

const route = useRoute()
const router = useRouter()

const viewport = ref<HTMLElement | null>(null)
let editor: Editor | null = null

const project = reactive<Project>(newProject())
const selected = ref<PartRef | null>(null)
const activeLayer = ref(0)
const mode = ref<GizmoMode>('translate')
const snap = ref(true)
const currentColor = ref('#9aa7b8')
const currentTexture = ref<PartTexture | undefined>()
const currentTextureUrl = ref<string | undefined>()
const loading = ref(true)
const saving = ref(false)

const history = new History()
// History isn't reactive; bumping this re-evaluates canUndo/canRedo.
const historyVersion = ref(0)
const canUndo = computed(() => historyVersion.value >= 0 && history.canUndo)
const canRedo = computed(() => historyVersion.value >= 0 && history.canRedo)

const savedSnapshot = ref('')
const snapshot = () => JSON.stringify({ name: project.name, layers: project.layers })
const dirty = computed(() => !loading.value && snapshot() !== savedSnapshot.value)

const partCount = computed(() => countParts(project.layers))
const lightCount = computed(() => countLights(project.layers))
const radius = computed(() => boundingRadius(project.layers))
const selectedPart = computed<Part | null>(() => {
  const ref = selected.value
  return (ref && project.layers[ref.layer]?.parts[ref.part]) || null
})
const currentLayer = computed<Layer | undefined>(() => project.layers[activeLayer.value])

// --- Lifecycle ---------------------------------------------------------------

onMounted(async () => {
  editor = new Editor(viewport.value!, {
    onSelect(ref) {
      selected.value = ref
      if (ref) activeLayer.value = ref.layer
    },
    onCommit: commit,
  })
  editor.setSnap(snap.value)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
  await load()
})

onBeforeUnmount(() => {
  stopUrlTextureListener()
  stopModelListener()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  editor?.destroy()
  editor = null
})

onBeforeRouteLeave(() => {
  if (dirty.value && !confirm(t.value.editor.unsavedLeave)) return false
})

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}

async function load() {
  loading.value = true
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  let loaded: Project = newProject()
  if (id) {
    try {
      loaded = await getProject(id)
    } catch (error) {
      showError(error, t.value.editor.loadFailed)
      await router.replace('/projects')
      return
    }
  }
  Object.assign(project, { _id: loaded._id, name: loaded.name, layers: loaded.layers })
  if (project.layers.length === 0) project.layers.push(newLayer(t.value.editor.hull))
  activeLayer.value = 0
  selected.value = null
  history.reset(project.layers)
  historyVersion.value++
  savedSnapshot.value = snapshot()
  editor?.setLayers(project.layers)
  editor?.focus()
  loading.value = false
}

// The view is reused when only the id changes (e.g. back/forward between two
// ships). Saving a new ship also changes it, but sets project._id first, so
// that case doesn't reload.
watch(
  () => route.params.id,
  (id) => {
    if ((id || undefined) === project._id) return
    if (dirty.value && !confirm(t.value.editor.unsavedDiscard)) return
    void load()
  },
)

watch(mode, (value) => editor?.setMode(value))
watch(snap, (value) => editor?.setSnap(value))

// --- History -----------------------------------------------------------------

function commit() {
  history.commit(project.layers)
  historyVersion.value++
}

function restore(layers: Layer[] | null) {
  if (!layers) return
  project.layers = layers
  historyVersion.value++
  const ref = selected.value
  if (ref && !project.layers[ref.layer]?.parts[ref.part]) selected.value = null
  activeLayer.value = Math.min(activeLayer.value, project.layers.length - 1)
  editor?.setLayers(project.layers)
  editor?.select(selected.value)
}

const undo = () => restore(history.undo())
const redo = () => restore(history.redo())

// --- Parts -------------------------------------------------------------------

function selectPart(ref: PartRef | null) {
  selected.value = ref
  if (ref) activeLayer.value = ref.layer
  editor?.select(ref)
}

/** Re-renders after the parts changed, keeping the selection. */
function refresh() {
  editor?.rebuild()
  editor?.select(selected.value)
}

function canAddPart(): boolean {
  if (partCount.value < LIMITS.parts) return true
  showAlert('error', t.value.ship.tooManyParts(LIMITS.parts))
  return false
}

/** Whether `extra` more lights fit in the ship; tells the user if not. */
function lightsFit(extra: number): boolean {
  if (lightCount.value + extra <= LIMITS.lights) return true
  showAlert('error', t.value.ship.tooManyLights(LIMITS.lights))
  return false
}

/** Adds a shape, or with a modelId an imported model, to the active layer. */
function addPart(type: PartType, modelId?: string) {
  if (!canAddPart()) return
  if (type === 'light' && !lightsFit(1)) return
  const layer = currentLayer.value
  if (!layer) return
  layer.visible = true
  // A light starts in its own warm white, not in the hull's color.
  const part = newPart(type, currentColor.value)
  if (modelId) {
    part.modelId = modelId
    // Models are often a whole ship: start them bigger than a shape.
    part.scale = [MODEL_SIZE, MODEL_SIZE, MODEL_SIZE]
  } else if (type !== 'light') {
    if (currentTexture.value) part.texture = currentTexture.value
    if (currentTextureUrl.value) part.textureUrl = currentTextureUrl.value
  }
  layer.parts.push(part)
  refresh()
  selectPart({ layer: activeLayer.value, part: layer.parts.length - 1 })
  commit()
}

const MODEL_SIZE = 4

const modelInput = ref<HTMLInputElement | null>(null)
const importingModel = ref(false)

/**
 * Imports the chosen .glb file as a part. It is read here first, so a file
 * the game couldn't draw is refused before it is uploaded, and the part
 * shows at once instead of downloading the model back.
 */
async function importModel(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !canAddPart()) return
  if (file.size > LIMITS.modelMegabytes * 1024 * 1024) {
    showAlert('error', t.value.editor.modelTooLarge(LIMITS.modelMegabytes))
    return
  }
  importingModel.value = true
  try {
    let model
    try {
      model = await parseModel(await file.arrayBuffer())
    } catch {
      showAlert('error', t.value.editor.modelUnreadable)
      return
    }
    const imported = await uploadModel(file)
    addLoadedModel(imported._id, model)
    addPart('model', imported._id)
  } catch (error) {
    showError(error, t.value.editor.importModelFailed)
  } finally {
    importingModel.value = false
  }
}

function duplicateSelected() {
  const ref = selected.value
  const part = selectedPart.value
  if (!ref || !part || !canAddPart()) return
  if (isLight(part) && !lightsFit(part.mirror ? 2 : 1)) return
  const copy = clonePart(part)
  copy.position[0] = Math.min(copy.position[0] + 1, LIMITS.coordinate)
  project.layers[ref.layer]!.parts.splice(ref.part + 1, 0, copy)
  refresh()
  selectPart({ layer: ref.layer, part: ref.part + 1 })
  commit()
}

function deleteSelected() {
  const ref = selected.value
  if (!ref || !selectedPart.value) return
  project.layers[ref.layer]!.parts.splice(ref.part, 1)
  selectPart(null)
  refresh()
  commit()
}

type VectorField = 'position' | 'rotation' | 'scale'

function displayValue(field: VectorField, axis: number): string {
  const value = selectedPart.value?.[field][axis] ?? 0
  return field === 'rotation'
    ? String(Math.round(((value * 180) / Math.PI) * 10) / 10)
    : String(Math.round(value * 1000) / 1000)
}

/**
 * Applies a typed number. While typing (`final` false) an out-of-range value
 * is simply not applied yet: clamping it would rewrite the box under the
 * cursor, so typing "0.2" into a size became 0.01 at the "0" and ended up as
 * "0.012". On change (blur/Enter) it is clamped and the box shows the result.
 */
function setVector(field: VectorField, axis: number, event: Event, final: boolean) {
  const part = selectedPart.value
  const input = event.target as HTMLInputElement
  const raw = parseFloat(input.value)
  if (!part) return
  if (Number.isFinite(raw)) {
    const value = field === 'rotation' ? (raw * Math.PI) / 180 : raw
    const [min, max] =
      field === 'position'
        ? [-LIMITS.coordinate, LIMITS.coordinate]
        : field === 'scale'
          ? [LIMITS.minScale, LIMITS.maxScale]
          : [-Infinity, Infinity]
    const clamped = Math.max(min, Math.min(max, value))
    if (final || clamped === value) {
      part[field][axis] = clamped
      refresh()
    }
  }
  if (final) {
    input.value = displayValue(field, axis)
    commit()
  }
}

function setColor(color: string) {
  const part = selectedPart.value
  // A light's color isn't one to build the next hull part in.
  if (!part || !isLight(part)) currentColor.value = color
  if (!part) return
  part.color = color
  refresh()
  commit()
}

/** undefined makes the part plain. */
function setTexture(texture: PartTexture | undefined) {
  const part = selectedPart.value
  currentTexture.value = texture
  currentTextureUrl.value = undefined
  if (!part) return
  // Deleted rather than set to undefined, so the saved part has no key.
  if (texture) part.texture = texture
  else delete part.texture
  delete part.textureUrl
  refresh()
  commit()
}

/** An image link as the texture; empty makes the part plain. */
function setTextureUrl(event: Event) {
  const input = event.target as HTMLInputElement
  const part = selectedPart.value
  const url = input.value.trim()
  if (!part) return
  if (url && !isValidTextureUrl(url)) {
    showAlert('error', t.value.editor.imageLinkRule(LIMITS.textureUrl))
    input.value = part.textureUrl ?? ''
    return
  }
  currentTexture.value = undefined
  currentTextureUrl.value = url || undefined
  delete part.texture
  if (url) part.textureUrl = url
  else delete part.textureUrl
  refresh()
  commit()
}

// Bumped when an image texture loads or fails, so its status below updates.
const urlTexturesSettled = ref(0)
const stopUrlTextureListener = onUrlTextureLoaded(() => urlTexturesSettled.value++)
const selectedUrlState = computed(() => {
  const url = selectedPart.value?.textureUrl
  return url && urlTexturesSettled.value >= 0 ? urlTextureState(url) : null
})

/** A CSS url() for an image link, quoted so any character in it is safe. */
const cssUrl = (url: string) => `url(${JSON.stringify(url)})`

// Drawn once, the first time the editor opens.
const textureSwatches = computed(() =>
  Object.fromEntries(PART_TEXTURES.map((texture) => [texture, textureSwatch(texture)])),
)

// Bumped when a model loads or fails, so its status below updates.
const modelsSettled = ref(0)
const stopModelListener = onModelLoaded(() => modelsSettled.value++)
const selectedModelState = computed(() => {
  const id = selectedPart.value?.modelId
  return id && modelsSettled.value >= 0 ? modelState(id) : null
})

/** Changes a shape into another (a model part has no type to choose). */
function setType(type: ShapeType, select: HTMLSelectElement) {
  const part = selectedPart.value
  if (!part) return
  if (type === 'light' && !isLight(part) && !lightsFit(part.mirror ? 2 : 1)) {
    select.value = part.type
    return
  }
  part.type = type
  // Lights have an intensity and nothing else has: no texture, no opacity.
  if (type === 'light') {
    part.intensity ??= DEFAULT_LIGHT.intensity
    delete part.texture
    delete part.textureUrl
    delete part.opacity
  } else {
    delete part.intensity
  }
  refresh()
  commit()
}

function setMirror(mirror: boolean, input: HTMLInputElement) {
  const part = selectedPart.value
  if (!part) return
  if (mirror && isLight(part) && !lightsFit(1)) {
    input.checked = false
    return
  }
  part.mirror = mirror
  refresh()
  commit()
}

/**
 * The opacity and intensity sliders apply as they move (`final` false) and
 * record an undo step when let go.
 */
function setOpacity(event: Event, final: boolean) {
  const part = selectedPart.value
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!part || !Number.isFinite(value)) return
  const opacity = Math.max(LIMITS.minOpacity, Math.min(1, value))
  // Deleted at 1, so an opaque part is saved as before opacity existed.
  if (opacity < 1) part.opacity = opacity
  else delete part.opacity
  refresh()
  if (final) commit()
}

function setIntensity(event: Event, final: boolean) {
  const part = selectedPart.value
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (!part || !Number.isFinite(value)) return
  part.intensity = Math.max(LIMITS.minIntensity, Math.min(LIMITS.maxIntensity, value))
  refresh()
  if (final) commit()
}

const SWATCHES = [
  '#9aa7b8',
  '#e6ecf5',
  '#555b66',
  '#e05a47',
  '#ff7043',
  '#ffd54f',
  '#66bb6a',
  '#4fc3f7',
  '#7e57c2',
]

// --- Layers ------------------------------------------------------------------

function setActiveLayer(index: number) {
  activeLayer.value = index
  if (selected.value && selected.value.layer !== index) selectPart(null)
}

function addLayer() {
  if (project.layers.length >= LIMITS.layers) {
    showAlert('error', t.value.ship.tooManyLayers(LIMITS.layers))
    return
  }
  project.layers.push(newLayer(t.value.editor.layerName(project.layers.length + 1)))
  setActiveLayer(project.layers.length - 1)
  commit()
}

function removeLayer(index: number) {
  const layer = project.layers[index]
  if (!layer || project.layers.length === 1) return
  if (
    layer.parts.length > 0 &&
    !confirm(t.value.editor.confirmDeleteLayer(layer.name, layer.parts.length))
  ) {
    return
  }
  project.layers.splice(index, 1)
  selectPart(null)
  activeLayer.value = Math.min(activeLayer.value, project.layers.length - 1)
  refresh()
  commit()
}

function toggleLayer(index: number) {
  const layer = project.layers[index]
  if (!layer) return
  layer.visible = !layer.visible
  if (!layer.visible && selected.value?.layer === index) selectPart(null)
  refresh()
  commit()
}

// --- Saving ------------------------------------------------------------------

async function save() {
  const problems = validateProject(project)
  if (problems.length > 0) {
    showAlert('error', ...problems)
    return
  }
  saving.value = true
  try {
    const saved = await saveProject({ ...project, layers: cloneLayers(project.layers) })
    const created = !project._id
    project._id = saved._id
    project.name = saved.name
    savedSnapshot.value = snapshot()
    showAlert('success', t.value.editor.saved)
    if (created) await router.replace(`/editor/${saved._id}`)
  } catch (error) {
    showError(error, t.value.editor.saveFailed)
  } finally {
    saving.value = false
  }
}

// --- Keyboard ----------------------------------------------------------------

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target?.closest('input, select, textarea, [contenteditable]')
  const ctrl = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (ctrl && key === 's') {
    event.preventDefault()
    void save()
    return
  }
  if (typing) return

  if (ctrl && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if (ctrl && key === 'y') {
    event.preventDefault()
    redo()
  } else if (ctrl && key === 'd') {
    event.preventDefault()
    duplicateSelected()
  } else if (ctrl) {
    return
  } else if (key === 'delete' || key === 'backspace') {
    deleteSelected()
  } else if (key === 'w') {
    mode.value = 'translate'
  } else if (key === 'e') {
    mode.value = 'rotate'
  } else if (key === 'r') {
    mode.value = 'scale'
  } else if (key === 'f') {
    editor?.focus()
  } else if (key === 'escape') {
    selectPart(null)
  }
}
</script>

<template>
  <div class="editor">
    <header class="toolbar">
      <RouterLink class="back" to="/projects" :title="t.editor.back">←</RouterLink>
      <input
        v-model="project.name"
        class="name"
        :placeholder="t.editor.shipName"
        :maxlength="LIMITS.projectName"
        :aria-label="t.editor.shipName"
      />
      <button class="primary" type="button" :disabled="saving || loading" @click="save">
        {{ project._id ? t.editor.save : t.editor.create }}{{ dirty ? ' •' : '' }}
      </button>

      <div class="group">
        <button type="button" :disabled="!canUndo" :title="t.editor.undo" @click="undo">↶</button>
        <button type="button" :disabled="!canRedo" :title="t.editor.redo" @click="redo">↷</button>
      </div>

      <div class="group" role="radiogroup" :aria-label="t.editor.tool">
        <button
          v-for="[value, label, key] in [
            ['translate', t.editor.move, 'W'],
            ['rotate', t.editor.rotate, 'E'],
            ['scale', t.editor.scale, 'R'],
          ] as const"
          :key="value"
          type="button"
          :class="{ active: mode === value }"
          :title="`${label} (${key})`"
          @click="mode = value"
        >
          {{ label }}
        </button>
      </div>
      <label class="check"><input v-model="snap" type="checkbox" /> {{ t.editor.snap }}</label>
      <button type="button" :title="t.editor.focusTitle" @click="editor?.focus()">
        {{ t.editor.focus }}
      </button>
      <span class="count">{{ t.editor.partCount(partCount, LIMITS.parts) }}</span>
    </header>

    <aside class="panel left">
      <section>
        <h3>
          {{ t.editor.layers }}
          <button type="button" class="small" :title="t.editor.addLayer" @click="addLayer">
            +
          </button>
        </h3>
        <ul class="list">
          <li
            v-for="(layer, i) in project.layers"
            :key="i"
            :class="{ active: i === activeLayer }"
            @click="setActiveLayer(i)"
          >
            <button
              type="button"
              class="icon"
              :title="layer.visible ? t.editor.hideLayer : t.editor.showLayer"
              @click.stop="toggleLayer(i)"
            >
              {{ layer.visible ? '👁' : '—' }}
            </button>
            <input
              v-model="layer.name"
              class="layer-name"
              :maxlength="LIMITS.layerName"
              @change="commit"
            />
            <span class="muted">{{ layer.parts.length }}</span>
            <button
              type="button"
              class="icon"
              :title="t.editor.deleteLayer"
              :disabled="project.layers.length === 1"
              @click.stop="removeLayer(i)"
            >
              ✕
            </button>
          </li>
        </ul>
      </section>

      <section>
        <h3>{{ t.editor.addPart }}</h3>
        <div class="add-grid">
          <button v-for="type in SHAPE_TYPES" :key="type" type="button" @click="addPart(type)">
            {{ t.ship.parts[type] }}
          </button>
        </div>
        <button
          type="button"
          class="import"
          :disabled="importingModel"
          @click="modelInput?.click()"
        >
          {{ importingModel ? t.editor.importingModel : t.editor.importModel }}
        </button>
        <input
          ref="modelInput"
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          @change="importModel"
        />
      </section>

      <section v-if="currentLayer">
        <h3>{{ t.editor.partsIn(currentLayer.name) }}</h3>
        <ul class="list">
          <li
            v-for="(part, i) in currentLayer.parts"
            :key="i"
            :class="{ active: selected?.layer === activeLayer && selected?.part === i }"
            @click="selectPart({ layer: activeLayer, part: i })"
          >
            <span v-if="part.type === 'model'" class="swatch model" aria-hidden="true" />
            <span
              v-else
              class="swatch"
              :class="{ bulb: isLight(part) }"
              :style="{
                backgroundColor: part.color,
                backgroundImage: part.textureUrl
                  ? cssUrl(part.textureUrl)
                  : part.texture
                    ? `url(${textureSwatches[part.texture]})`
                    : 'none',
              }"
            />
            {{ t.ship.parts[part.type] }} {{ i + 1 }}
            <span v-if="part.mirror" class="muted" :title="t.editor.mirrored">⇋</span>
          </li>
          <li v-if="currentLayer.parts.length === 0" class="muted">{{ t.editor.noParts }}</li>
        </ul>
      </section>
    </aside>

    <div ref="viewport" class="viewport" />

    <aside class="panel right">
      <template v-if="selectedPart">
        <h3>{{ t.editor.part }}</h3>
        <div v-if="selectedPart.type === 'model'" class="row">
          {{ t.editor.type }}
          <span>{{ t.editor.model }}</span>
        </div>
        <label v-else class="row">
          {{ t.editor.type }}
          <select
            :value="selectedPart.type"
            @change="
              setType(
                ($event.target as HTMLSelectElement).value as ShapeType,
                $event.target as HTMLSelectElement,
              )
            "
          >
            <option v-for="type in SHAPE_TYPES" :key="type" :value="type">
              {{ t.ship.parts[type] }}
            </option>
          </select>
        </label>

        <div class="vector axes" aria-hidden="true">
          <span />
          <span v-for="(axis, i) in ['X', 'Y', 'Z']" :key="axis" :style="{ color: AXIS_COLORS[i] }">
            {{ axis }}
          </span>
        </div>
        <div
          v-for="[field, label, step] in [
            ['position', t.editor.position, 0.25],
            ['rotation', t.editor.rotation, 15],
            ['scale', t.editor.size, 0.1],
          ] as const"
          :key="field"
          class="vector"
        >
          <span>{{ label }}</span>
          <input
            v-for="(axis, i) in ['X', 'Y', 'Z']"
            :key="axis"
            type="number"
            :step="step"
            :aria-label="`${label} ${axis}`"
            :title="axis"
            :style="{ borderLeftColor: AXIS_COLORS[i] }"
            :value="displayValue(field, i)"
            @input="setVector(field, i, $event, false)"
            @change="setVector(field, i, $event, true)"
          />
        </div>

        <template v-if="selectedPart.type === 'model'">
          <p v-if="selectedModelState === 'failed'" class="muted hint">
            {{ t.editor.modelFailed }}
          </p>
          <p v-else class="muted hint">{{ t.editor.modelHint }}</p>
          <label class="row">
            {{ t.editor.opacity }}
            <span class="slider">
              <input
                type="range"
                :min="LIMITS.minOpacity"
                max="1"
                step="0.05"
                :value="selectedPart.opacity ?? 1"
                @input="setOpacity($event, false)"
                @change="setOpacity($event, true)"
              />
              <span class="value">{{ Math.round((selectedPart.opacity ?? 1) * 100) }}%</span>
            </span>
          </label>
        </template>
        <template v-else>
          <label class="row">
            {{ t.editor.color }}
            <input
              type="color"
              :value="selectedPart.color"
              @change="setColor(($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="swatches">
            <button
              v-for="color in SWATCHES"
              :key="color"
              type="button"
              class="swatch-button"
              :style="{ background: color }"
              :title="color"
              @click="setColor(color)"
            />
          </div>

          <template v-if="isLight(selectedPart)">
            <label class="row">
              {{ t.editor.intensity }}
              <span class="slider">
                <input
                  type="range"
                  :min="LIMITS.minIntensity"
                  :max="LIMITS.maxIntensity"
                  step="0.1"
                  :value="selectedPart.intensity ?? DEFAULT_LIGHT.intensity"
                  @input="setIntensity($event, false)"
                  @change="setIntensity($event, true)"
                />
                <span class="value">{{
                  (selectedPart.intensity ?? DEFAULT_LIGHT.intensity).toFixed(1)
                }}</span>
              </span>
            </label>
            <p class="muted hint">{{ t.editor.lightHint(lightCount, LIMITS.lights) }}</p>
          </template>
          <template v-else>
            <label class="row">
              {{ t.editor.opacity }}
              <span class="slider">
                <input
                  type="range"
                  :min="LIMITS.minOpacity"
                  max="1"
                  step="0.05"
                  :value="selectedPart.opacity ?? 1"
                  @input="setOpacity($event, false)"
                  @change="setOpacity($event, true)"
                />
                <span class="value">{{ Math.round((selectedPart.opacity ?? 1) * 100) }}%</span>
              </span>
            </label>

            <div class="row">{{ t.editor.texture }}</div>
            <div class="textures">
              <button
                type="button"
                class="texture-button"
                :class="{ active: !selectedPart.texture && !selectedPart.textureUrl }"
                :style="{ backgroundColor: selectedPart.color }"
                :title="t.editor.plainTexture"
                :aria-label="t.editor.plainTexture"
                @click="setTexture(undefined)"
              />
              <button
                v-for="texture in PART_TEXTURES"
                :key="texture"
                type="button"
                class="texture-button"
                :class="{ active: selectedPart.texture === texture }"
                :style="{
                  backgroundColor: selectedPart.color,
                  backgroundImage: `url(${textureSwatches[texture]})`,
                }"
                :title="t.ship.textures[texture]"
                :aria-label="t.ship.textures[texture]"
                @click="setTexture(texture)"
              />
            </div>
            <label class="row">
              {{ t.editor.imageLink }}
              <input
                type="url"
                class="texture-url"
                placeholder="https://…"
                :maxlength="LIMITS.textureUrl"
                :value="selectedPart.textureUrl ?? ''"
                @change="setTextureUrl"
              />
            </label>
            <p v-if="selectedUrlState === 'failed'" class="muted hint">
              {{ t.editor.imageFailed }}
            </p>
            <p v-else-if="selectedPart.textureUrl" class="muted hint">
              {{ t.editor.imageHint }}
            </p>
          </template>
        </template>

        <label class="row check">
          <input
            type="checkbox"
            :checked="selectedPart.mirror"
            @change="
              setMirror(
                ($event.target as HTMLInputElement).checked,
                $event.target as HTMLInputElement,
              )
            "
          />
          {{ t.editor.mirror }}
        </label>

        <div class="actions">
          <button type="button" title="Ctrl+D" @click="duplicateSelected">
            {{ t.editor.duplicate }}
          </button>
          <button type="button" class="danger" title="Delete" @click="deleteSelected">
            {{ t.editor.delete }}
          </button>
        </div>
      </template>
      <template v-else>
        <h3>{{ t.editor.noSelection }}</h3>
        <p class="muted">{{ t.editor.noSelectionHelp }}</p>
        <p class="muted">{{ t.editor.axesHelp }}</p>
      </template>

      <p class="muted size">{{ t.editor.radius(radius.toFixed(1)) }}</p>
    </aside>
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: 15rem 1fr 18rem;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'toolbar toolbar toolbar'
    'left viewport right';
  /* Not 100%: the parent <main> is a flex item, whose height doesn't count
     as definite for a percentage. This is a full-screen route anyway. */
  height: 100dvh;
}
.toolbar {
  grid-area: toolbar;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.8rem;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.back {
  font-size: 1.3rem;
  text-decoration: none;
  color: var(--text);
}
.name {
  width: 14rem;
}
.group {
  display: flex;
}
.group button {
  border-radius: 0;
}
.group button:first-child {
  border-radius: var(--radius);
}
.group button:last-child {
  border-radius: var(--radius);
}
button.active {
  border-color: var(--accent);
  color: var(--accent);
}
.count {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.9rem;
}
.viewport {
  grid-area: viewport;
  position: relative;
  min-height: 0;
  overflow: hidden;
}
.panel {
  overflow-y: auto;
  padding: 0.6rem 0.8rem;
  background: var(--panel);
}
.left {
  grid-area: left;
  border-right: 1px solid var(--border);
}
.right {
  grid-area: right;
  border-left: 1px solid var(--border);
}
h3 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0.6rem 0 0.4rem;
  font-size: 0.95rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  border-radius: var(--radius);
  cursor: pointer;
}
.list li.active {
  background: var(--panel-2);
  outline: 1px solid var(--accent);
}
.layer-name {
  flex: 1;
  min-width: 0;
  padding: 0.15rem 0.3rem !important;
}
button.small,
button.icon {
  padding: 0.1rem 0.45rem;
}
button.icon {
  background: none;
  border-color: transparent;
}
.add-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.import {
  width: 100%;
  margin-top: 0.4rem;
}
.swatch {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.muted {
  color: var(--muted);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0.5rem 0;
}
.row.check,
.check {
  justify-content: flex-start;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.vector {
  display: grid;
  grid-template-columns: 4.5rem repeat(3, 1fr);
  gap: 0.3rem;
  align-items: center;
  margin: 0.4rem 0;
}
.vector input {
  width: 100%;
  min-width: 0;
  padding: 0.25rem !important;
  border-left: 3px solid;
  /* The spinner arrows took most of the room; the step still works with the
     keyboard arrows. */
  appearance: textfield;
  -moz-appearance: textfield;
}
.vector.axes {
  margin-bottom: 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
}
.vector input::-webkit-inner-spin-button,
.vector input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.swatch-button {
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border-radius: var(--radius);
}
.textures {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.3rem;
  margin-bottom: 0.5rem;
}
/* The textures are light greys; multiplying them with the part's color
   previews them as they look on the part. */
.texture-button,
.swatch {
  background-size: cover;
  background-blend-mode: multiply;
}
/* A model keeps its own colors: a cube outline instead of a color. */
.swatch.model {
  border-color: var(--muted);
  transform: rotate(45deg) scale(0.8);
}
.texture-button {
  aspect-ratio: 1;
  padding: 0;
  border-radius: var(--radius);
  border: 2px solid var(--border);
}
.slider {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.slider input {
  width: 7.5rem;
}
.slider .value {
  min-width: 2.6rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.texture-url {
  flex: 1;
  min-width: 0;
}
.hint {
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
.swatch.bulb {
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}
.texture-button.active {
  border-color: var(--accent);
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
}
.size {
  margin-top: 1.5rem;
  font-size: 0.85rem;
}

/* Phones and narrow windows: the view on top, panels stacked below it. */
@media (max-width: 900px) {
  .editor {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 55dvh auto;
    grid-template-areas:
      'toolbar toolbar'
      'viewport viewport'
      'left right';
    height: auto;
    min-height: 100dvh;
  }
  .name {
    width: 9rem;
  }
}
@media (max-width: 560px) {
  .editor {
    grid-template-columns: 1fr;
    grid-template-areas:
      'toolbar'
      'viewport'
      'right'
      'left';
  }
}
</style>
