import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
} from 'three'

import { edgeFaces, edgeNearness, nearestFace, type Face } from './edge'
import { FLASH_SECONDS, WAVE_SECONDS, fade, waveRadius } from './impact'

/** The most the field fills in, at the edge itself: space still shows through. */
const MOST_OPACITY = 0.55
/** How far inside the edge the field is drawn, so it never fights the grid's lines. */
const INSET = 0.998
/** The face's middle is brighter than its corners. */
const CORNER_SHADE = 0.4
const FIELD_COLOUR = 0x4fc3f7
/** The real world's radius, which the shock wave's reach is made for: a smaller world gets a smaller wave. */
const REAL_WORLD_RADIUS = 1500
/** The shock wave's ring: how wide it is, as a share of how far it has spread. */
const WAVE_WIDTH_SHARE = 0.08
const WAVE_COLOUR = 0x5fb0ff

/**
 * The world's edge as a force field: as the ship nears it, the face of the
 * edge's grid nearest the ship fills in, more opaque the nearer.
 */
export class ForceField {
  private readonly faces: Face[]
  private readonly material = new MeshBasicMaterial({
    color: FIELD_COLOUR,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  private readonly geometry = new BufferGeometry()
  private readonly mesh: Mesh
  private shown: Face | undefined
  private readonly flashGeometry = new BufferGeometry()
  private readonly flashMaterial = new MeshBasicMaterial({
    color: WAVE_COLOUR,
    vertexColors: true,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  private readonly flash: Mesh
  private readonly waveMaterial = new MeshBasicMaterial({
    color: WAVE_COLOUR,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  private readonly waveGeometry = new RingGeometry(1 - WAVE_WIDTH_SHARE, 1, 64)
  private readonly wave: Mesh
  private struckAt = -Infinity

  constructor(
    private readonly scene: Scene,
    private readonly worldRadius: number,
  ) {
    this.faces = edgeFaces(worldRadius)
    this.mesh = new Mesh(this.geometry, this.material)
    this.mesh.visible = false
    this.mesh.frustumCulled = false
    this.flash = new Mesh(this.flashGeometry, this.flashMaterial)
    this.wave = new Mesh(this.waveGeometry, this.waveMaterial)
    for (const mesh of [this.flash, this.wave]) {
      mesh.visible = false
      mesh.frustumCulled = false
    }
    scene.add(this.mesh, this.flash, this.wave)
  }

  /**
   * The ship ran into the edge at `point`, `now` seconds: the struck face
   * flashes and a shock wave spreads across the field from there.
   */
  crash(point: Vector3, now: number): void {
    this.struckAt = now
    const face = nearestFace(this.faces, point)
    if (face) {
      layOut(this.flashGeometry, face)
    }
    // The ring lies on the field, facing the middle of the world.
    this.wave.position.copy(point).multiplyScalar(INSET)
    this.wave.quaternion.copy(
      facing.setFromUnitVectors(towards, inward.copy(point).negate().normalize()),
    )
  }

  /** Spreads the shock wave and fades the flash, `now` seconds. */
  showCrash(now: number): void {
    const age = now - this.struckAt
    const flash = fade(age, FLASH_SECONDS)
    const wave = fade(age, WAVE_SECONDS)
    this.flash.visible = flash > 0
    this.flashMaterial.opacity = flash
    this.wave.visible = wave > 0
    this.waveMaterial.opacity = wave
    if (this.wave.visible) {
      const reach = Math.min(1, this.worldRadius / REAL_WORLD_RADIUS)
      this.wave.scale.setScalar(Math.max(waveRadius(age) * reach, 1))
    }
  }

  /** Fills in the face nearest the ship, as opaque as the ship is near the edge. */
  update(ship: Vector3): void {
    const nearness = edgeNearness(ship, this.worldRadius)
    this.mesh.visible = nearness > 0
    if (!this.mesh.visible) {
      return
    }
    const face = nearestFace(this.faces, ship)
    if (face && face !== this.shown) {
      this.shown = face
      layOut(this.geometry, face)
    }
    this.material.opacity = nearness * MOST_OPACITY
  }

  dispose(): void {
    this.scene.remove(this.mesh, this.flash, this.wave)
    for (const disposable of [
      this.geometry,
      this.material,
      this.flashGeometry,
      this.flashMaterial,
      this.waveGeometry,
      this.waveMaterial,
    ]) {
      disposable.dispose()
    }
  }
}

const facing = new Quaternion()
const inward = new Vector3()
/** A ring is made facing +Z. */
const towards = new Vector3(0, 0, 1)

/** Lays a face out just inside the edge, as three triangles round its middle. */
export function layOut(geometry: BufferGeometry, face: Face): void {
  const middle = face[0].clone().add(face[1]).add(face[2]).divideScalar(3)
  const positions: number[] = []
  const colours: number[] = []
  for (let corner = 0; corner < 3; corner++) {
    for (const [point, shade] of [
      [middle, 1],
      [face[corner]!, CORNER_SHADE],
      [face[(corner + 1) % 3]!, CORNER_SHADE],
    ] as const) {
      positions.push(point.x * INSET, point.y * INSET, point.z * INSET)
      colours.push(shade, shade, shade)
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
  geometry.computeBoundingSphere()
}
