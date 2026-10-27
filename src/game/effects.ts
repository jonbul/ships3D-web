import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three'

import { FORWARD } from './flight'

const BULLET_LENGTH = 5
const EXPLOSION_SECONDS = 0.9
const MISSILE_LENGTH = 3
/** Seconds between the puffs of a missile's trail. */
const TRAIL_INTERVAL = 0.04

/**
 * Bullet and explosion visuals, from pools. A busy fight creates and drops
 * dozens of these a second; reusing meshes (and sharing two geometries) keeps
 * that from turning into garbage collection pauses on a phone.
 */
export class Effects {
  private readonly bulletGeometry = new CylinderGeometry(0.25, 0.25, BULLET_LENGTH, 6)
  private readonly ownBulletMaterial = new MeshBasicMaterial({ color: 0xffe082 })
  private readonly enemyBulletMaterial = new MeshBasicMaterial({ color: 0xff5252 })
  private readonly explosionGeometry = new IcosahedronGeometry(1, 1)
  private readonly freeBullets: Mesh[] = []
  private readonly explosions: Array<{ mesh: Mesh; age: number; size: number }> = []
  private readonly freeExplosions: Mesh[] = []
  private readonly orientation = new Quaternion()
  private readonly missileBodyGeometry = new CylinderGeometry(0.35, 0.35, MISSILE_LENGTH, 8)
  private readonly missileNoseGeometry = new ConeGeometry(0.35, 0.9, 8)
  private readonly missileFlameGeometry = new ConeGeometry(0.4, 1.6, 8)
  private readonly missileBodyMaterial = new MeshBasicMaterial({ color: 0xe0e6ef })
  private readonly ownMissileNoseMaterial = new MeshBasicMaterial({ color: 0xffe082 })
  private readonly enemyMissileNoseMaterial = new MeshBasicMaterial({ color: 0xff5252 })
  private readonly flameMaterial = new MeshBasicMaterial({
    color: 0xff9e40,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  private readonly freeMissiles: Group[] = []
  private readonly trails = new Map<Group, number>()

  constructor(private readonly scene: Scene) {
    // Cylinders and cones are built along Y; bullets and missiles fly along
    // their direction (+Z), nose first.
    this.bulletGeometry.rotateX(Math.PI / 2)
    this.missileBodyGeometry.rotateX(Math.PI / 2)
    this.missileNoseGeometry.rotateX(Math.PI / 2).translate(0, 0, MISSILE_LENGTH / 2 + 0.45)
    // The flame points backwards, out of the tail.
    this.missileFlameGeometry.rotateX(-Math.PI / 2).translate(0, 0, -MISSILE_LENGTH / 2 - 0.8)
  }

  /** A missile: a body, a colored nose (ours or theirs) and a flame. */
  missile(own: boolean, position: Vector3, direction: Vector3): Group {
    let group = this.freeMissiles.pop()
    if (!group) {
      group = new Group()
      group.add(
        new Mesh(this.missileBodyGeometry, this.missileBodyMaterial),
        new Mesh(this.missileNoseGeometry),
        new Mesh(this.missileFlameGeometry, this.flameMaterial),
      )
    }
    ;(group.children[1] as Mesh).material = own
      ? this.ownMissileNoseMaterial
      : this.enemyMissileNoseMaterial
    this.placeMissile(group, position, direction)
    this.trails.set(group, 0)
    this.scene.add(group)
    return group
  }

  /** Moves a missile, leaving a trail of puffs behind it. */
  moveMissile(group: Group, position: Vector3, direction: Vector3, dt: number): void {
    this.placeMissile(group, position, direction)
    const since = (this.trails.get(group) ?? 0) + dt
    if (since >= TRAIL_INTERVAL) {
      this.explosion(position, 0.9, 0x7a7f88)
      this.trails.set(group, 0)
    } else {
      this.trails.set(group, since)
    }
  }

  releaseMissile(group: Group): void {
    this.scene.remove(group)
    this.trails.delete(group)
    this.freeMissiles.push(group)
  }

  private placeMissile(group: Group, position: Vector3, direction: Vector3): void {
    group.position.copy(position)
    group.quaternion.copy(this.orientation.setFromUnitVectors(FORWARD, direction))
  }

  bullet(own: boolean, position: Vector3, direction: Vector3): Mesh {
    const mesh = this.freeBullets.pop() ?? new Mesh(this.bulletGeometry)
    mesh.material = own ? this.ownBulletMaterial : this.enemyBulletMaterial
    mesh.position.copy(position)
    mesh.quaternion.copy(this.orientation.setFromUnitVectors(FORWARD, direction))
    this.scene.add(mesh)
    return mesh
  }

  releaseBullet(mesh: Mesh): void {
    this.scene.remove(mesh)
    this.freeBullets.push(mesh)
  }

  /** A flash that grows and fades; `size` is its final radius. */
  explosion(position: Vector3, size: number, color = 0xff8a3d): void {
    const mesh =
      this.freeExplosions.pop() ??
      new Mesh(
        this.explosionGeometry,
        new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }),
      )
    ;(mesh.material as MeshBasicMaterial).color.setHex(color)
    mesh.position.copy(position)
    this.scene.add(mesh)
    this.explosions.push({ mesh, age: 0, size })
  }

  update(dt: number): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i]!
      explosion.age += dt
      const t = explosion.age / EXPLOSION_SECONDS
      if (t >= 1) {
        this.scene.remove(explosion.mesh)
        this.freeExplosions.push(explosion.mesh)
        this.explosions.splice(i, 1)
        continue
      }
      explosion.mesh.scale.setScalar(explosion.size * (0.3 + 0.7 * Math.sqrt(t)))
      ;(explosion.mesh.material as MeshBasicMaterial).opacity = 1 - t
    }
  }

  dispose(): void {
    this.bulletGeometry.dispose()
    this.ownBulletMaterial.dispose()
    this.enemyBulletMaterial.dispose()
    this.explosionGeometry.dispose()
    this.missileBodyGeometry.dispose()
    this.missileNoseGeometry.dispose()
    this.missileFlameGeometry.dispose()
    this.missileBodyMaterial.dispose()
    this.ownMissileNoseMaterial.dispose()
    this.enemyMissileNoseMaterial.dispose()
    this.flameMaterial.dispose()
    for (const { mesh } of this.explosions) (mesh.material as MeshBasicMaterial).dispose()
    for (const mesh of this.freeExplosions) (mesh.material as MeshBasicMaterial).dispose()
  }
}
