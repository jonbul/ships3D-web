import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Box3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'

import { buildShip } from '@/shared/shipMesh'
import type { Layer } from '@/shared/shipModel'

// The hangar the Play page's ship turns in, as on the 3DS: a round platform
// floating in open space, with a glowing rim, a planet far behind and
// spotlights round its edge whose beams sweep up into the stars. Distances
// are in the scene's units; the ship is scaled to SHIP_RADIUS.
const SHIP_RADIUS = 7
const PLATFORM_TOP = -2.6
const PLATFORM_RADIUS = 10
const PLATFORM_THICKNESS = 1.2
const KEEL_DEPTH = 7
const SPOTLIGHTS = 4
const BEAM_HEIGHT = 40
const BEAM_TOP_RADIUS = 1.5
const BEAM_BASE_RADIUS = 0.3
const BEAM_OPACITY = 0.12
/** Radians the beams lean outward, and sweep either way, and how fast (radians a second). */
const BEAM_LEAN = 0.3
const BEAM_SWAY = 0.2
const BEAM_SWAY_SPEED = 0.5
/** Turns a second of the ship on its platform. */
const TURNS_PER_SECOND = 0.12
const STARS = 600
/** The title's ship: how often it crosses, how far ahead of the camera, how wide, how low, how big. */
const FLYBY_SECONDS = 7
const FLYBY_DISTANCE = 60
const FLYBY_CROSSING = 110
const FLYBY_HEIGHT = -6
const FLYBY_RADIUS = 6
const ahead = new Vector3()
const right = new Vector3()
/** Where the camera looks at the platform from, and how fast it drifts with only space to show. */
const CAMERA_DISTANCE = 36
const CAMERA_HEIGHT = 12
/** The narrowest screen, width over height, that sees the platform whole from CAMERA_DISTANCE. */
const NARROWEST_FITTING_ASPECT = 1.3
const DRIFT_TURNS_PER_SECOND = 0.01
const STAR_RADIUS = 150

/** The hangar's scene, drawn on a canvas of its own. */
export class Hangar {
  readonly canvas: HTMLCanvasElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(40, 1, 0.5, 600)
  private readonly turntable = new Group()
  /** The platform, its lamps and beams, and the ship: hidden while only space shows. */
  private readonly stage = new Group()
  private readonly beams: Array<{ mesh: Mesh; outward: number; phase: number }> = []
  private readonly disposables: Array<BufferGeometry | Material> = []
  private ship: Group | null = null
  /** The title's ship, crossing the screen ahead of the camera; null when not on the title. */
  private flyer: Group | null = null
  private frame = 0
  private distance = CAMERA_DISTANCE
  private readonly started = performance.now()

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.canvas = this.renderer.domElement
    this.scene.background = new Color(0x02030a)
    this.scene.add(new AmbientLight(0xffffff, 0.9))
    const sun = new DirectionalLight(0xfff2dd, 2.2)
    sun.position.set(4, 6, -3)
    this.scene.add(sun)
    this.stage.add(this.platform(), this.turntable)
    this.scene.add(this.stars(), this.planet(), this.stage)
    this.addSpotlights()
    this.frame = requestAnimationFrame(this.draw)
  }

  /** Puts a ship on the platform, scaled to fit, in place of the last one. */
  show(layers: Layer[]): void {
    if (this.ship) {
      this.turntable.remove(this.ship)
    }
    this.ship = this.fitted(layers, SHIP_RADIUS)
    this.turntable.add(this.ship)
  }

  /** A ship's design built and scaled to a radius, centred on its holder. */
  private fitted(layers: Layer[], radius: number): Group {
    const ship = buildShip(layers)
    const bounds = new Box3().setFromObject(ship)
    const sphere = bounds.isEmpty()
      ? new Sphere(new Vector3(), 1)
      : bounds.getBoundingSphere(new Sphere())
    ship.position.copy(sphere.center).negate()
    const holder = new Group()
    holder.add(ship)
    holder.scale.setScalar(radius / Math.max(sphere.radius, 0.1))
    return holder
  }

  /**
   * Flies a ship across the screen ahead of the camera, rolling as it goes,
   * as the 3DS's title does; null stops it.
   */
  setFlyby(layers: Layer[] | null): void {
    if (this.flyer) {
      this.scene.remove(this.flyer)
      this.flyer = null
    }
    if (!layers) {
      return
    }
    this.flyer = this.fitted(layers, FLYBY_RADIUS)
    this.scene.add(this.flyer)
  }

  /** Shows the platform and its ship, or only space, the camera drifting slowly round it. */
  setPlatform(visible: boolean): void {
    this.stage.visible = visible
  }

  /** Fits the drawing to its canvas's size on the page. */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    // A narrow screen (a phone held upright) sees less across: the camera stands back to fit the platform.
    this.distance = CAMERA_DISTANCE * Math.max(1, NARROWEST_FITTING_ASPECT / this.camera.aspect)
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    for (const item of this.disposables) {
      item.dispose()
    }
    // The ship's meshes belong to shipMesh.ts, shared with the rest of the site.
    this.renderer.dispose()
  }

  private draw = (time: number): void => {
    const seconds = (time - this.started) / 1000
    this.turntable.rotation.y = seconds * TURNS_PER_SECOND * 2 * Math.PI
    // With only space to show, the camera drifts round, looking out.
    const drift = this.stage.visible ? 0 : seconds * DRIFT_TURNS_PER_SECOND * 2 * Math.PI
    const height = (CAMERA_HEIGHT * this.distance) / CAMERA_DISTANCE
    this.camera.position.set(
      this.distance * Math.sin(drift),
      height,
      -this.distance * Math.cos(drift),
    )
    this.camera.lookAt(0, 0, 0)
    this.flyBy(seconds)
    for (const beam of this.beams) {
      beam.mesh.rotation.z =
        -beam.outward * (BEAM_LEAN + BEAM_SWAY * Math.sin(seconds * BEAM_SWAY_SPEED + beam.phase))
    }
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.draw)
  }

  /** Moves the title's ship along its crossing: once every FLYBY_SECONDS, left to right, rolling once. */
  private flyBy(seconds: number): void {
    if (!this.flyer) {
      return
    }
    const share = (seconds % FLYBY_SECONDS) / FLYBY_SECONDS
    this.camera.getWorldDirection(ahead)
    right.crossVectors(ahead, this.camera.up).normalize()
    this.flyer.position
      .copy(this.camera.position)
      .addScaledVector(ahead, FLYBY_DISTANCE)
      .addScaledVector(right, FLYBY_CROSSING * (share - 0.5))
      .addScaledVector(this.camera.up, FLYBY_HEIGHT + 3 * Math.sin(share * 2 * Math.PI))
    // Nose along the crossing, rolling once on the way.
    this.flyer.lookAt(this.flyer.position.clone().add(right))
    this.flyer.rotateZ(share * 2 * Math.PI)
  }

  private platform(): Group {
    const platform = new Group()
    const hull = this.track(new MeshStandardMaterial({ color: 0x3a4658, roughness: 0.8 }))
    const deck = this.track(new MeshStandardMaterial({ color: 0x5a6a80, roughness: 0.6 }))
    const keel = this.track(new MeshStandardMaterial({ color: 0x252d3a, roughness: 1 }))
    const rim = this.track(new MeshBasicMaterial({ color: 0x5fb0ff }))
    const base = new Mesh(
      this.track(new CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS, PLATFORM_THICKNESS, 48)),
      hull,
    )
    base.position.y = PLATFORM_TOP - PLATFORM_THICKNESS / 2
    const plate = new Mesh(
      this.track(new CylinderGeometry(PLATFORM_RADIUS - 1.5, PLATFORM_RADIUS - 1.5, 0.1, 48)),
      deck,
    )
    plate.position.y = PLATFORM_TOP + 0.05
    const ring = new Mesh(this.track(new TorusGeometry(PLATFORM_RADIUS + 0.3, 0.3, 8, 64)), rim)
    ring.rotation.x = Math.PI / 2
    ring.position.y = PLATFORM_TOP
    const underneath = new Mesh(
      this.track(new ConeGeometry(PLATFORM_RADIUS * 0.7, KEEL_DEPTH, 32)),
      keel,
    )
    underneath.rotation.x = Math.PI
    underneath.position.y = PLATFORM_TOP - PLATFORM_THICKNESS - KEEL_DEPTH / 2
    platform.add(base, plate, ring, underneath)
    return platform
  }

  /** Spotlights between the ship's nose, tail and sides, each a lamp and a beam that sweeps. */
  private addSpotlights(): void {
    const lamp = this.track(new SphereGeometry(0.5, 12, 8))
    const lampMaterial = this.track(new MeshBasicMaterial({ color: 0xe8f2ff }))
    const beamGeometry = this.track(
      new CylinderGeometry(BEAM_TOP_RADIUS, BEAM_BASE_RADIUS, BEAM_HEIGHT, 16, 1, true),
    )
    // Built about its middle: moved up so it turns about its foot.
    beamGeometry.translate(0, BEAM_HEIGHT / 2, 0)
    const beamMaterial = this.track(
      new MeshBasicMaterial({
        color: 0x73b3ff,
        transparent: true,
        opacity: BEAM_OPACITY,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    for (let index = 0; index < SPOTLIGHTS; index++) {
      const angle = ((index + 0.5) * 2 * Math.PI) / SPOTLIGHTS
      const x = (PLATFORM_RADIUS - 0.8) * Math.sin(angle)
      const z = (PLATFORM_RADIUS - 0.8) * Math.cos(angle)
      const bulb = new Mesh(lamp, lampMaterial)
      bulb.position.set(x, PLATFORM_TOP + 0.2, z)
      const beam = new Mesh(beamGeometry, beamMaterial)
      beam.position.set(x, PLATFORM_TOP, z)
      this.stage.add(bulb, beam)
      this.beams.push({ mesh: beam, outward: Math.sign(x), phase: index * 1.7 })
    }
  }

  private stars(): Points {
    const positions: number[] = []
    const point = new Vector3()
    for (let index = 0; index < STARS; index++) {
      point.randomDirection().multiplyScalar(STAR_RADIUS)
      positions.push(point.x, point.y, point.z)
    }
    const geometry = this.track(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return new Points(
      geometry,
      this.track(new PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })),
    )
  }

  private planet(): Mesh {
    const planet = new Mesh(
      this.track(new SphereGeometry(22, 32, 20)),
      this.track(new MeshStandardMaterial({ color: 0x6a4fb0, roughness: 1 })),
    )
    planet.position.set(-70, -10, 120)
    return planet
  }

  private track<T extends BufferGeometry | Material>(item: T): T {
    this.disposables.push(item)
    return item
  }
}
