import { describe, it, expect } from 'vitest'
import { OrthographicCamera, Raycaster, Vector2 } from 'three'
import { Flatland } from '../Flatland'
import { PixelPerfectCamera } from '../cameras/PixelPerfectCamera'
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

  it('maps a full-canvas parent pointer into Flatland letterboxing', () => {
    const flatland = new Flatland({ viewSize: 240 })
    flatland.resize(1280, 720)
    const compute = createFlatlandCompute(() => flatland)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    const parentState = {
      camera: new OrthographicCamera(),
      pointer: new Vector2(0, 0),
      size: { width: 640, height: 360 },
      viewport: { dpr: 2 },
    }

    compute({} as never, portalState as never, parentState as never)
    expect(portalState.pointer.toArray()).toEqual([0, 0])
    expect(portalState.raycaster.camera).toBe(flatland.camera)

    parentState.pointer.x = -1
    compute({} as never, portalState as never, parentState as never)
    expect(portalState.raycaster.camera).toBeUndefined()
  })

  it('does not double-apply a parent pixel camera viewport', () => {
    const parentCamera = new PixelPerfectCamera({ viewSize: 240 })
    parentCamera.setDrawingBufferSize(1280, 720)
    const flatland = new Flatland({ viewSize: 240 })
    flatland.resize(1280, 720)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }

    createFlatlandCompute(() => flatland)(
      {} as never,
      portalState as never,
      {
        camera: parentCamera,
        pointer: new Vector2(0.25, -0.5),
        size: { width: 640, height: 360 },
        viewport: { dpr: 2 },
      } as never
    )

    expect(portalState.pointer.x).toBeCloseTo(0.25)
    expect(portalState.pointer.y).toBeCloseTo(-0.5)
  })

  it('leaves raycaster.camera unset when flatland is not ready (R3F skips the root)', () => {
    const compute = createFlatlandCompute(() => null)
    const portalState = { pointer: new Vector2(), raycaster: new Raycaster() }
    compute({} as never, portalState as never, { pointer: new Vector2(1, 1) } as never)
    expect(portalState.raycaster.camera).toBeUndefined()
  })
})
