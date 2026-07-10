import { describe, it, expect } from 'vitest'
import { Vector2 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland } from './Flatland'

/**
 * Minimal renderer stub for exercising Flatland.render() headlessly.
 * Only the members render() touches are provided; the size is mutable
 * so tests can simulate R3F's measure lifecycle (0×0 first commit,
 * real size after ResizeObserver fires, resizes later).
 */
function mockRenderer(width: number, height: number) {
  const state = { width, height }
  const renderer = {
    getSize: (target: Vector2) => target.set(state.width, state.height),
    getPixelRatio: () => 1,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearColor: () => {},
    render: () => {},
    autoClear: true,
  } as unknown as WebGPURenderer
  return { renderer, state }
}

describe('Flatland — resize()', () => {
  it('sets the frustum from a non-square size: halfWidth === viewSize * aspect / 2', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(1280, 720)

    const aspect = 1280 / 720
    expect(flatland.aspect).toBeCloseTo(aspect)
    expect(flatland.camera.right).toBeCloseTo((800 * aspect) / 2)
    expect(flatland.camera.left).toBeCloseTo(-(800 * aspect) / 2)
    expect(flatland.camera.top).toBe(400)
    expect(flatland.camera.bottom).toBe(-400)
  })

  it('ignores zero dimensions instead of latching a NaN aspect', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(0, 0)

    expect(flatland.aspect).toBe(1)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)

    // A zero-size call must not disable the eventual real resize
    flatland.resize(1280, 720)
    expect(flatland.aspect).toBeCloseTo(1280 / 720)
  })

  it('ignores NaN and negative dimensions', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(NaN, 720)
    flatland.resize(1280, NaN)
    flatland.resize(-1280, 720)
    flatland.resize(1280, 0)

    expect(flatland.aspect).toBe(1)
    expect(flatland.camera.right).toBe(400)
  })
})

describe('Flatland — aspect property', () => {
  it('pins the aspect and updates the frustum', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.aspect = 2

    expect(flatland.camera.right).toBe(800)
    expect(flatland.camera.left).toBe(-800)
  })

  it('rejects non-finite and non-positive values', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.aspect = NaN
    flatland.aspect = 0
    flatland.aspect = -1
    flatland.aspect = Infinity

    expect(flatland.aspect).toBe(1)
  })
})

describe('Flatland — automatic aspect sync in render()', () => {
  it('derives the aspect from the renderer size when never told otherwise', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.render(renderer)

    const aspect = 1280 / 720
    expect(flatland.aspect).toBeCloseTo(aspect)
    expect(flatland.camera.right).toBeCloseTo((800 * aspect) / 2)
  })

  it('tracks renderer size changes across frames', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer, state } = mockRenderer(1280, 720)

    flatland.render(renderer)
    expect(flatland.aspect).toBeCloseTo(1280 / 720)

    state.width = 1920
    state.height = 1080
    flatland.render(renderer)
    expect(flatland.aspect).toBeCloseTo(1920 / 1080)
  })

  it('does not latch a bad aspect from a 0x0 first commit (R3F pre-measure)', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer, state } = mockRenderer(0, 0)

    flatland.render(renderer)
    expect(flatland.aspect).toBe(1)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)

    // Once the canvas is measured, the next frame picks up the real size
    state.width = 1280
    state.height = 720
    flatland.render(renderer)
    expect(flatland.aspect).toBeCloseTo(1280 / 720)
  })

  it('stays manual after an explicit resize()', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.resize(800, 800)
    flatland.render(renderer)

    expect(flatland.aspect).toBe(1)
  })

  it('stays manual when the aspect option is passed', () => {
    const flatland = new Flatland({ viewSize: 800, aspect: 2 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.render(renderer)

    expect(flatland.aspect).toBe(2)
  })

  it('derives the aspect from the render target when rendering to texture', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)
    flatland.renderTarget = { width: 512, height: 256, setSize: () => {} } as never

    flatland.render(renderer)

    expect(flatland.aspect).toBeCloseTo(2)
  })
})
