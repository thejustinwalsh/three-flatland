import { Matrix4, Ray, Vector2, Vector3 } from 'three'
import type { Intersection, Object3D, Raycaster } from 'three'

const _invMatrix = new Matrix4()
const _localRay = new Ray()
const _worldPoint = new Vector3()

/** Result of a local Z=0 plane intersection. Scratch values — consume
 * immediately or go through createIntersection (which clones). */
export interface RayPlaneHit {
  localX: number
  localY: number
  distance: number
}

/**
 * Intersect the raycaster's ray with `object`'s local Z=0 plane.
 * Returns local hit coordinates + world distance, or null when the ray
 * is parallel, the plane is behind the origin, or the hit falls
 * outside `raycaster.near`/`far`. Allocation-free.
 */
export function rayPlaneZ0(raycaster: Raycaster, object: Object3D): RayPlaneHit | null {
  _invMatrix.copy(object.matrixWorld).invert()
  _localRay.copy(raycaster.ray).applyMatrix4(_invMatrix)
  const dz = _localRay.direction.z
  if (dz === 0) return null
  const t = -_localRay.origin.z / dz
  if (t < 0) return null
  const localX = _localRay.origin.x + _localRay.direction.x * t
  const localY = _localRay.origin.y + _localRay.direction.y * t
  _worldPoint.set(localX, localY, 0).applyMatrix4(object.matrixWorld)
  const distance = raycaster.ray.origin.distanceTo(_worldPoint)
  if (distance < raycaster.near || distance > raycaster.far) return null
  return { localX, localY, distance }
}

/**
 * Build a standard three.js Intersection from a RayPlaneHit. The world
 * point is freshly allocated per call — safe to store (spec §11.2).
 */
export function createIntersection(hit: RayPlaneHit, object: Object3D, u: number, v: number): Intersection {
  return {
    distance: hit.distance,
    point: new Vector3(hit.localX, hit.localY, 0).applyMatrix4(object.matrixWorld),
    object,
    uv: new Vector2(u, v),
    face: null,
    faceIndex: undefined,
  } as unknown as Intersection
}
