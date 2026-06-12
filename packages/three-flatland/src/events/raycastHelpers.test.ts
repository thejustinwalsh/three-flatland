import { describe, it, expect } from 'vitest'
import { Object3D, Raycaster } from 'three'
import { rayPlaneZ0, createIntersection } from './raycastHelpers'

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

describe('rayPlaneZ0', () => {
  it('intersects the local Z=0 plane of a transformed object', () => {
    const obj = new Object3D()
    obj.position.set(10, 5, 0)
    obj.scale.set(2, 2, 1)
    obj.updateMatrixWorld(true)
    // World (11, 6) is local (0.5, 0.5) after inverse translate+scale
    const hit = rayPlaneZ0(makeRaycaster(11, 6), obj)
    expect(hit).not.toBeNull()
    expect(hit!.localX).toBeCloseTo(0.5)
    expect(hit!.localY).toBeCloseTo(0.5)
    expect(hit!.distance).toBeCloseTo(10)
  })

  it('returns null for a ray parallel to the plane', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0)
    r.ray.direction.set(1, 0, 0)
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })

  it('returns null when the hit is outside near/far', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, 10)
    r.far = 5
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })

  it('returns null when the plane is behind the ray origin', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, -10) // origin behind plane, looking away
    expect(rayPlaneZ0(r, obj)).toBeNull()
  })
})

describe('createIntersection', () => {
  it('clones the world point per intersection (spec §11.2 regression)', () => {
    const obj = new Object3D()
    obj.updateMatrixWorld(true)
    const a = createIntersection(rayPlaneZ0(makeRaycaster(1, 1), obj)!, obj, 0, 0)
    const b = createIntersection(rayPlaneZ0(makeRaycaster(2, 2), obj)!, obj, 0, 0)
    expect(a.point).not.toBe(b.point)
    expect(a.point.x).toBeCloseTo(1)
    expect(b.point.x).toBeCloseTo(2)
  })
})
