import { BufferGeometry, IcosahedronGeometry, Vector3 } from 'three'

/**
 * How much of the world's radius, in from its edge, the edge is felt over:
 * the force field shows, the camera draws back and the copilot speaks up.
 */
export const EDGE_WARNING_SHARE = 0.12

/** How finely the edge's sphere is cut into faces, as the boundary's grid. */
export const EDGE_DETAIL = 4

/**
 * How near a point is to the world's edge: 0 farther in than the warning
 * band, rising to 1 on the edge itself.
 */
export function edgeNearness(position: Vector3, worldRadius: number): number {
  if (worldRadius <= 0) {
    return 0
  }
  const band = worldRadius * EDGE_WARNING_SHARE
  return Math.min(Math.max((position.length() - (worldRadius - band)) / band, 0), 1)
}

/** A face of the edge's grid: its three corners. */
export type Face = [Vector3, Vector3, Vector3]

/**
 * The faces of the edge's grid, the same as the boundary's wireframe draws,
 * so the one that fills in lines up with the lines around it.
 */
export function edgeFaces(worldRadius: number): Face[] {
  const geometry: BufferGeometry = new IcosahedronGeometry(worldRadius, EDGE_DETAIL)
  const positions = geometry.getAttribute('position')
  const faces: Face[] = []
  for (let index = 0; index + 2 < positions.count; index += 3) {
    faces.push([
      new Vector3().fromBufferAttribute(positions, index),
      new Vector3().fromBufferAttribute(positions, index + 1),
      new Vector3().fromBufferAttribute(positions, index + 2),
    ])
  }
  geometry.dispose()
  return faces
}

const middle = new Vector3()

/** The face whose middle is nearest the point. */
export function nearestFace(faces: Face[], point: Vector3): Face | undefined {
  let nearest: Face | undefined
  let best = Infinity
  for (const face of faces) {
    middle.copy(face[0]).add(face[1]).add(face[2]).divideScalar(3)
    const distance = middle.distanceToSquared(point)
    if (distance < best) {
      nearest = face
      best = distance
    }
  }
  return nearest
}
