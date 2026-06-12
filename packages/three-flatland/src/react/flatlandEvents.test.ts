import { describe, it, expect } from 'vitest'
import { OrthographicCamera, Raycaster, Vector2 } from 'three'
import { Flatland } from '../Flatland'
import { createFlatlandCompute } from './flatlandEvents'

describe('createFlatlandCompute', () => {
  it('re-casts the parent pointer from the flatland camera', () => {
    const flatland = new Flatland({ viewSize: 200 })
    expect(flatland.camera).toBeInstanceOf(OrthographicCamera)

    const compute = createFlatlandCompute(() => flatland)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    const parentState = { pointer: new Vector2(0.5, -0.25) }

    compute({} as never, portalState as never, parentState as never)

    expect(portalState.pointer.x).toBe(0.5)
    expect(portalState.pointer.y).toBe(-0.25)
    expect(portalState.raycaster.camera).toBe(flatland.camera)
    expect(portalState.raycaster.ray.direction.z).toBeCloseTo(-1)
  })

  it('leaves raycaster.camera unset when flatland is not ready (R3F skips the root)', () => {
    const compute = createFlatlandCompute(() => null)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    compute({} as never, portalState as never, { pointer: new Vector2(1, 1) } as never)
    expect(portalState.raycaster.camera).toBeUndefined()
  })
})
