import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three'

import { EDGE_DETAIL } from './edge'

const SKY_RADIUS = 6000
const STARS = 2500
/** Space dust: specks around the ship that make speed visible. */
const DUST = 500
const DUST_BOX = 300

/**
 * Everything in the scene that isn't a ship or a bullet: lights, stars,
 * distant planets for orientation, drifting dust, and the edge of the world.
 */
export class World {
  private readonly sky = new Group()
  private readonly dust: Points
  private readonly dustPositions: Float32Array
  private readonly disposables: Array<BufferGeometry | Material> = []

  constructor(
    private readonly scene: Scene,
    worldRadius: number,
  ) {
    scene.background = new Color(0x02030a)
    scene.add(new HemisphereLight(0xcfd9ff, 0x1a1020, 1.1))
    const sun = new DirectionalLight(0xfff2dd, 2.4)
    sun.position.set(1, 0.6, 0.3)
    scene.add(sun)

    // Stars and planets live on the "sky": a group that follows the camera,
    // so they never get closer however far a ship flies - which is what makes
    // them usable as landmarks to steer by.
    this.sky.add(this.createStars())
    this.addPlanet(new Vector3(0.6, 0.15, 0.78), 900, 0xd2733c)
    this.addPlanet(new Vector3(-0.7, -0.35, -0.6), 500, 0x4f7cc9)
    this.addPlanet(new Vector3(-0.15, 0.95, -0.25), 260, 0x9e9e9e)
    scene.add(this.sky)

    this.dustPositions = new Float32Array(DUST * 3)
    for (let i = 0; i < this.dustPositions.length; i++) {
      this.dustPositions[i] = (Math.random() - 0.5) * DUST_BOX
    }
    const dustGeometry = this.track(new BufferGeometry())
    // A plain BufferAttribute uses this array as is, so wrapping the specks in
    // update() moves what's drawn; Float32BufferAttribute would copy it.
    dustGeometry.setAttribute('position', new BufferAttribute(this.dustPositions, 3))
    this.dust = new Points(
      dustGeometry,
      this.track(
        new PointsMaterial({ color: 0x8899bb, size: 0.6, transparent: true, opacity: 0.6 }),
      ),
    )
    this.dust.frustumCulled = false
    scene.add(this.dust)

    const boundary = new Mesh(
      this.track(new IcosahedronGeometry(worldRadius, EDGE_DETAIL)),
      this.track(
        new MeshBasicMaterial({
          color: 0x4fc3f7,
          wireframe: true,
          transparent: true,
          opacity: 0.05,
        }),
      ),
    )
    scene.add(boundary)
  }

  /** Keeps the sky around the camera and the dust around the ship. */
  update(cameraPosition: Vector3): void {
    this.sky.position.copy(cameraPosition)

    // Wrap each speck into the box centred on the camera, so the dust is
    // endless without ever being more than DUST points.
    const half = DUST_BOX / 2
    const p = this.dustPositions
    let moved = false
    for (let i = 0; i < p.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const center =
          axis === 0 ? cameraPosition.x : axis === 1 ? cameraPosition.y : cameraPosition.z
        const offset = p[i + axis]! - center
        if (offset > half || offset < -half) {
          p[i + axis] = center + ((((offset + half) % DUST_BOX) + DUST_BOX) % DUST_BOX) - half
          moved = true
        }
      }
    }
    if (moved) this.dust.geometry.attributes.position!.needsUpdate = true
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose()
  }

  private createStars(): Points {
    const positions = new Float32Array(STARS * 3)
    const v = new Vector3()
    for (let i = 0; i < STARS; i++) {
      v.randomDirection().multiplyScalar(SKY_RADIUS)
      v.toArray(positions, i * 3)
    }
    const geometry = this.track(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const material = this.track(
      new PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }),
    )
    return new Points(geometry, material)
  }

  private addPlanet(direction: Vector3, radius: number, color: number): void {
    const planet = new Mesh(
      this.track(new SphereGeometry(radius, 32, 20)),
      this.track(
        new MeshStandardMaterial({ color, roughness: 1, emissive: color, emissiveIntensity: 0.08 }),
      ),
    )
    planet.position.copy(direction.normalize().multiplyScalar(SKY_RADIUS * 0.8))
    this.sky.add(planet)
  }

  private track<T extends BufferGeometry | Material>(item: T): T {
    this.disposables.push(item)
    return item
  }
}
