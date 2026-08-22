import { describe, it, expect, vi } from 'vitest'
import { OrthographicCamera, Vector2 } from 'three'
import { vec4 } from 'three/tsl'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland } from './Flatland'
import { createLightEffect } from './lights/LightEffect'

/**
 * Minimal renderer stub for exercising Flatland.render() headlessly.
 * Only the members render() touches are provided; the size is mutable
 * so tests can simulate R3F's measure lifecycle (0×0 first commit,
 * real size after ResizeObserver fires, resizes later).
 */
function mockRenderer(width: number, height: number, pixelRatio = 1) {
  const state = { width, height }
  let getSizeCalls = 0
  let getDrawingBufferSizeCalls = 0
  const renderer = {
    getSize: (target: Vector2) => {
      getSizeCalls++
      return target.set(state.width, state.height)
    },
    getDrawingBufferSize: (target: Vector2) => {
      getDrawingBufferSizeCalls++
      return target.set(Math.floor(state.width * pixelRatio), Math.floor(state.height * pixelRatio))
    },
    getPixelRatio: () => pixelRatio,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearColor: () => {},
    render: () => {},
    autoClear: true,
  } as unknown as WebGPURenderer
  return {
    renderer,
    state,
    getSizeCalls: () => getSizeCalls,
    getDrawingBufferSizeCalls: () => getDrawingBufferSizeCalls,
  }
}

function lifecycleEffect(events: string[]) {
  const Effect = createLightEffect({
    name: 'resizeLifecycleTest',
    schema: {} as const,
    light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
    init() {
      events.push('init')
    },
    resize(width, height) {
      events.push(`resize:${width}x${height}`)
    },
    update() {
      events.push('update')
    },
    dispose() {
      events.push('dispose')
    },
  })
  return new Effect()
}

describe('Flatland — resize()', () => {
  it('sets the frustum from a non-square size: halfWidth === viewSize * aspect / 2', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(1280, 720)

    const aspect = 1280 / 720
    expect(flatland.resolvedAspect).toBeCloseTo(aspect)
    expect(flatland.camera.right).toBeCloseTo((800 * aspect) / 2)
    expect(flatland.camera.left).toBeCloseTo(-(800 * aspect) / 2)
    expect(flatland.camera.top).toBe(400)
    expect(flatland.camera.bottom).toBe(-400)
  })

  it('ignores zero dimensions instead of latching a NaN aspect', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(0, 0)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)

    // A zero-size call must not disable the eventual real resize
    flatland.resize(1280, 720)
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
  })

  it('ignores NaN and negative dimensions', () => {
    const flatland = new Flatland({ viewSize: 800 })
    flatland.resize(NaN, 720)
    flatland.resize(1280, NaN)
    flatland.resize(-1280, 720)
    flatland.resize(1280, 0)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
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

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
  })

  it('treats an invalid constructor aspect as automatic instead of latching it', () => {
    const flatland = new Flatland({ viewSize: 800, aspect: 0 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.render(renderer)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)
  })

  it('returns to automatic sizing after a fixed aspect or manual resize', () => {
    const events: string[] = []
    const flatland = new Flatland({ viewSize: 800, aspect: 2 })
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))

    flatland.resize(800, 800)
    // R3F restores a removed prop from a fresh no-arg instance. Flatland's
    // default getter must therefore expose the explicit auto sentinel.
    flatland.aspect = new Flatland().aspect
    flatland.render(renderer)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
  })

  it('reports but never rewrites a user-supplied camera frustum', () => {
    const camera = new OrthographicCamera(-30, 30, 15, -15, 0.1, 1000)
    const flatland = new Flatland({ camera, viewSize: 800, aspect: 3 })
    const { renderer } = mockRenderer(1280, 720)

    expect(flatland.aspect).toBe(3)
    expect(flatland.resolvedAspect).toBe(2)

    flatland.aspect = 4
    flatland.resize(400, 800)
    flatland.aspect = 'auto'
    flatland.render(renderer)

    expect(camera.left).toBe(-30)
    expect(camera.right).toBe(30)
    expect(camera.top).toBe(15)
    expect(camera.bottom).toBe(-15)
    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(2)
  })
})

describe('Flatland — automatic aspect sync in render()', () => {
  it('derives the aspect from the renderer size when never told otherwise', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.render(renderer)

    const aspect = 1280 / 720
    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBeCloseTo(aspect)
    expect(flatland.camera.right).toBeCloseTo((800 * aspect) / 2)
  })

  it('samples logical globals and the physical drawing buffer once per frame', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer, getSizeCalls, getDrawingBufferSizeCalls } = mockRenderer(1280, 720)

    flatland.render(renderer)

    expect(getSizeCalls()).toBe(1)
    expect(getDrawingBufferSizeCalls()).toBe(1)
  })

  it('tracks renderer size changes across frames', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer, state } = mockRenderer(1280, 720)

    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)

    state.width = 1920
    state.height = 1080
    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(1920 / 1080)
  })

  it('does not latch a bad aspect from a 0x0 first commit (R3F pre-measure)', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer, state } = mockRenderer(0, 0)

    flatland.render(renderer)
    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)

    // Once the canvas is measured, the next frame picks up the real size
    state.width = 1280
    state.height = 720
    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
  })

  it('defers the first effect resize until a 0x0 surface becomes measurable', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer, state } = mockRenderer(0, 0)
    flatland.setLighting(lifecycleEffect(events))

    flatland.render(renderer)
    expect(events).toEqual(['init', 'update'])

    state.width = 1280
    state.height = 720
    flatland.render(renderer)
    expect(events).toEqual(['init', 'update', 'resize:1280x720', 'update'])
  })

  it('stays manual after an explicit resize()', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)

    flatland.resize(800, 800)
    flatland.render(renderer)

    expect(flatland.aspect).toBe(1)
    expect(flatland.resolvedAspect).toBe(1)
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
    flatland.renderTarget = {
      width: 512,
      height: 256,
      texture: { colorSpace: '' },
      setSize: () => {},
    } as never

    flatland.render(renderer)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBeCloseTo(2)
  })

  it('tracks render-target swaps without resizing user-owned targets', () => {
    const flatland = new Flatland({ viewSize: 800 })
    const { renderer } = mockRenderer(1280, 720)
    const firstSetSize = vi.fn()
    const secondSetSize = vi.fn()
    flatland.renderTarget = {
      width: 512,
      height: 256,
      texture: { colorSpace: '' },
      setSize: firstSetSize,
    } as never

    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(2)

    flatland.renderTarget = {
      width: 300,
      height: 600,
      texture: { colorSpace: '' },
      setSize: secondSetSize,
    } as never
    flatland.render(renderer)

    expect(flatland.resolvedAspect).toBeCloseTo(0.5)
    expect(firstSetSize).not.toHaveBeenCalled()
    expect(secondSetSize).not.toHaveBeenCalled()

    flatland.renderTarget = null
    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
  })
})

describe('Flatland — LightEffect surface sizing', () => {
  it('initializes before the first resize and update', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const effect = lifecycleEffect(events)
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(effect)

    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
    expect(effect._initialized).toBe(true)
  })

  it('sizes an effect attached after the surface was already measured', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer } = mockRenderer(1280, 720)
    flatland.render(renderer)

    flatland.setLighting(lifecycleEffect(events))
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
  })

  it('resizes only when automatic surface dimensions change', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer, state } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))

    flatland.render(renderer)
    flatland.render(renderer)
    state.width = 1920
    state.height = 1080
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update', 'update', 'resize:1920x1080', 'update'])
  })

  it('keeps effect sizing automatic when only the camera aspect is pinned', () => {
    const events: string[] = []
    const flatland = new Flatland({ aspect: 2 })
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))

    flatland.render(renderer)

    expect(flatland.aspect).toBe(2)
    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
  })

  it('uses physical drawing-buffer pixels consistently with render-target texels', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer } = mockRenderer(1280, 720, 2)
    flatland.setLighting(lifecycleEffect(events))

    flatland.render(renderer)
    flatland.renderTarget = {
      width: 2560,
      height: 1440,
      texture: { colorSpace: '' },
      textures: [{ colorSpace: '' }],
      setSize: () => {},
    } as never
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:2560x1440', 'update', 'update'])
  })

  it('applies the effect-owned resolution scale without changing camera framing', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const effect = lifecycleEffect(events)
    effect.resolutionScale = 0.5
    const { renderer } = mockRenderer(1280, 720, 2)
    flatland.setLighting(effect)

    flatland.render(renderer)

    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
  })

  it('re-applies the current surface when resolutionScale changes at runtime', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const effect = lifecycleEffect(events)
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(effect)

    flatland.render(renderer)
    effect.resolutionScale = 0.5
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update', 'resize:640x360', 'update'])
  })

  it('ignores invalid effect resolution scales', () => {
    const effect = lifecycleEffect([])

    effect.resolutionScale = 0
    effect.resolutionScale = -1
    effect.resolutionScale = Number.NaN
    effect.resolutionScale = Number.POSITIVE_INFINITY

    expect(effect.resolutionScale).toBe(1)
  })

  it('resumes automatic effect sizing when a numeric aspect follows resize()', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))

    flatland.resize(800, 800)
    flatland.aspect = 1
    flatland.render(renderer)

    expect(flatland.aspect).toBe(1)
    expect(events).toEqual(['init', 'resize:1280x720', 'update'])
  })

  it('keeps explicit resize dimensions under manual surface control', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))
    flatland.resize(800, 800)

    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:800x800', 'update'])
  })

  it('delivers a resize missed while an effect was disabled before updating again', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const effect = lifecycleEffect(events)
    const { renderer, state } = mockRenderer(1280, 720)
    flatland.setLighting(effect)

    flatland.render(renderer)
    effect.enabled = false
    state.width = 1920
    state.height = 1080
    flatland.render(renderer)
    effect.enabled = true
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update', 'resize:1920x1080', 'update'])
  })

  it('disposes an effect before replacement so reattachment cannot leak its initialized resources', () => {
    const firstEvents: string[] = []
    const secondEvents: string[] = []
    const flatland = new Flatland()
    const first = lifecycleEffect(firstEvents)
    const second = lifecycleEffect(secondEvents)
    const { renderer } = mockRenderer(1280, 720)

    flatland.setLighting(first)
    flatland.render(renderer)
    flatland.setLighting(second)
    flatland.render(renderer)
    flatland.setLighting(first)
    flatland.render(renderer)

    expect(firstEvents).toEqual(['init', 'resize:1280x720', 'update', 'dispose', 'init', 'resize:1280x720', 'update'])
    expect(secondEvents).toEqual(['init', 'resize:1280x720', 'update', 'dispose'])
  })

  it('keeps an idempotent lighting assignment attached without rebuilding', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const effect = lifecycleEffect(events)
    const { renderer } = mockRenderer(1280, 720)

    flatland.setLighting(effect)
    flatland.render(renderer)
    flatland.setLighting(effect)
    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1280x720', 'update', 'update'])
  })

  it('allows vanilla Flatland instances to share an internal camera before rendering', () => {
    const source = new Flatland()
    const consumer = new Flatland()

    consumer.camera = source.camera

    expect(consumer.camera).toBe(source.camera)
  })
})
