import { describe, it, expect, vi } from 'vitest'
import { OrthographicCamera, Vector2, Vector4 } from 'three'
import { vec4 } from 'three/tsl'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland } from './Flatland'
import { createLightEffect } from './lights/LightEffect'
import { PixelPerfectCamera } from './cameras/PixelPerfectCamera'
import { createPassEffect } from './pipeline/PassEffect'

/**
 * Minimal renderer stub for exercising Flatland.render() headlessly.
 * Only the members render() touches are provided; the size is mutable
 * so tests can simulate R3F's measure lifecycle (0×0 first commit,
 * real size after ResizeObserver fires, resizes later).
 */
function mockRenderer(width: number, height: number, pixelRatio = 1) {
  const state = { width, height }
  const viewport = new Vector4(0, 0, width, height)
  let renderTarget: { viewport?: Vector4 } | null = null
  const renderedViewports: Vector4[] = []
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
    getViewport: (target: Vector4) => target.copy(viewport),
    setViewport: (x: number | Vector4, y?: number, viewportWidth?: number, viewportHeight?: number) => {
      if (x instanceof Vector4) viewport.copy(x)
      else viewport.set(x, y!, viewportWidth!, viewportHeight!)
    },
    getRenderTarget: () => renderTarget,
    setRenderTarget: (target: { viewport?: Vector4 } | null) => {
      renderTarget = target
    },
    setClearColor: () => {},
    render: () => {
      renderedViewports.push((renderTarget?.viewport ?? viewport).clone())
    },
    autoClear: true,
  } as unknown as WebGPURenderer
  return {
    renderer,
    state,
    getSizeCalls: () => getSizeCalls,
    getDrawingBufferSizeCalls: () => getDrawingBufferSizeCalls,
    viewport,
    renderedViewports,
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
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
    flatland.resize(1280, 720)

    const aspect = 1280 / 720
    expect(flatland.resolvedAspect).toBeCloseTo(aspect)
    expect(flatland.camera.right).toBeCloseTo((800 * aspect) / 2)
    expect(flatland.camera.left).toBeCloseTo(-(800 * aspect) / 2)
    expect(flatland.camera.top).toBe(400)
    expect(flatland.camera.bottom).toBe(-400)
  })

  it('ignores zero dimensions instead of latching a NaN aspect', () => {
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
    flatland.resize(0, 0)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)

    // A zero-size call must not disable the eventual real resize
    flatland.resize(1280, 720)
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
  })

  it('ignores NaN and negative dimensions', () => {
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
    flatland.resize(NaN, 720)
    flatland.resize(1280, NaN)
    flatland.resize(-1280, 720)
    flatland.resize(1280, 0)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
    expect(flatland.camera.right).toBe(400)
  })
})

describe('Flatland — pixel-perfect camera', () => {
  it('uses PixelPerfectCamera by default', () => {
    const flatland = new Flatland({ viewSize: 240 })

    expect(flatland.pixelPerfect).toBe(true)
    expect(flatland.camera).toBeInstanceOf(PixelPerfectCamera)
  })

  it('fits the managed camera to the physical drawing buffer', () => {
    const flatland = new Flatland({ pixelPerfect: true, viewSize: 240 })
    const { renderer, renderedViewports, viewport } = mockRenderer(640, 360, 2)

    flatland.render(renderer)

    const camera = flatland.camera as PixelPerfectCamera
    expect(camera.drawingBufferWidth).toBe(1280)
    expect(camera.drawingBufferHeight).toBe(720)
    expect(camera.resolvedPixelScale).toBe(3)
    expect(camera.viewport.toArray()).toEqual([1, 0, 1278, 720])
    expect(flatland.resolvedAspect).toBeCloseTo(426 / 240)
    const renderedViewport = renderedViewports[0]!
    expect(renderedViewport.x).toBeCloseTo(0.5)
    expect(renderedViewport.y).toBeCloseTo(0)
    expect(renderedViewport.width).toBeCloseTo(639)
    expect(renderedViewport.height).toBeCloseTo(360)
    expect(viewport.toArray()).toEqual([0, 0, 640, 360])
  })

  it('converts a manual canvas size from CSS pixels through renderer DPR', () => {
    const flatland = new Flatland({ pixelPerfect: true, viewSize: 240 })
    const { renderer, renderedViewports } = mockRenderer(640, 360, 2)

    flatland.resize(640, 360)
    flatland.render(renderer)

    const camera = flatland.camera as PixelPerfectCamera
    expect(camera.drawingBufferWidth).toBe(1280)
    expect(camera.drawingBufferHeight).toBe(720)
    expect(camera.resolvedPixelScale).toBe(3)
    expect(camera.viewport.toArray()).toEqual([1, 0, 1278, 720])
    expect(renderedViewports[0]?.x).toBeCloseTo(0.5)
    expect(renderedViewports[0]?.y).toBeCloseTo(0)
    expect(renderedViewports[0]?.width).toBeCloseTo(639)
    expect(renderedViewports[0]?.height).toBeCloseTo(360)
  })

  it('keeps manual render-target dimensions in physical texels', () => {
    const flatland = new Flatland({ pixelPerfect: true, viewSize: 128 })
    const { renderer } = mockRenderer(640, 360, 2)
    const setSize = vi.fn()
    const target = {
      width: 513,
      height: 257,
      viewport: new Vector4(0, 0, 513, 257),
      texture: { colorSpace: '' },
      setSize,
    }
    flatland.renderTarget = target as never

    flatland.resize(513, 257)
    flatland.render(renderer)

    const camera = flatland.camera as PixelPerfectCamera
    expect(setSize).toHaveBeenCalledWith(513, 257)
    expect(camera.drawingBufferWidth).toBe(513)
    expect(camera.drawingBufferHeight).toBe(257)
    expect(camera.viewport.toArray()).toEqual([0, 0, 512, 256])
  })

  it('letterboxes a fixed two-dimensional design extent', () => {
    const flatland = new Flatland({ viewSize: 180, viewWidth: 320 })
    const { renderer } = mockRenderer(800, 720)

    flatland.render(renderer)

    const camera = flatland.camera as PixelPerfectCamera
    expect(flatland.viewWidth).toBe(320)
    expect(camera.resolvedPixelScale).toBe(2)
    expect(camera.viewport.toArray()).toEqual([80, 180, 640, 360])

    flatland.viewWidth = undefined
    flatland.render(renderer)
    expect(camera.viewport.toArray()).toEqual([0, 0, 800, 720])
  })

  it('uses render-target texels without applying renderer DPR', () => {
    const flatland = new Flatland({ pixelPerfect: true, viewSize: 128 })
    const { renderer, renderedViewports } = mockRenderer(640, 360, 2)
    const target = {
      width: 513,
      height: 257,
      viewport: new Vector4(0, 0, 513, 257),
      texture: { colorSpace: '' },
      setSize: () => {},
    }
    flatland.renderTarget = target as never

    flatland.render(renderer)

    const camera = flatland.camera as PixelPerfectCamera
    expect(camera.drawingBufferWidth).toBe(513)
    expect(camera.drawingBufferHeight).toBe(257)
    expect(camera.resolvedPixelScale).toBe(2)
    expect(camera.viewport.toArray()).toEqual([0, 0, 512, 256])
    expect(renderedViewports[0]?.toArray()).toEqual([0, 0, 512, 256])
    expect(target.viewport.toArray()).toEqual([0, 0, 513, 257])
  })

  it('switches managed camera modes through the R3F-settable property', () => {
    const flatland = new Flatland({ viewSize: 240 })
    flatland.camera.position.set(12, 34, 56)
    flatland.camera.rotation.set(0.1, 0.2, 0.3)
    flatland.camera.layers.enable(4)
    flatland.camera.zoom = 1.5
    flatland.camera.near = 2
    flatland.camera.far = 500

    flatland.pixelPerfect = true
    expect(flatland.camera).toBeInstanceOf(PixelPerfectCamera)

    flatland.pixelPerfect = false
    expect(flatland.camera).toBeInstanceOf(OrthographicCamera)
    expect(flatland.camera).not.toBeInstanceOf(PixelPerfectCamera)
    expect(flatland.camera.position.toArray()).toEqual([12, 34, 56])
    expect(flatland.camera.rotation.x).toBeCloseTo(0.1)
    expect(flatland.camera.rotation.y).toBeCloseTo(0.2)
    expect(flatland.camera.rotation.z).toBeCloseTo(0.3)
    expect(flatland.camera.layers.isEnabled(4)).toBe(true)
    expect(flatland.camera.zoom).toBe(1.5)
    expect(flatland.camera.near).toBe(2)
    expect(flatland.camera.far).toBe(500)
  })

  it('preserves the centered pixel viewport through auto post-processing', () => {
    const TestPass = createPassEffect({
      name: 'pixelViewportTest',
      schema: {},
      pass: () => (input) => input,
    })
    const flatland = new Flatland({ viewSize: 400 })
    const { renderer } = mockRenderer(1281, 801)
    flatland.resize(1281, 801)
    flatland.addPass(new TestPass())

    const syncSurfaceSize = Reflect.get(flatland, '_syncSurfaceSize') as (renderer: WebGPURenderer) => void
    syncSurfaceSize.call(flatland, renderer)
    const ensurePipeline = Reflect.get(flatland, '_ensureRenderPipeline') as (renderer: WebGPURenderer) => void
    ensurePipeline.call(flatland, renderer)

    const passNode = Reflect.get(flatland, '_passNode') as { _viewport: Vector4 | null }
    const uvScale = Reflect.get(flatland, '_passViewportUvScale') as { value: Vector2 }
    const uvOffset = Reflect.get(flatland, '_passViewportUvOffset') as { value: Vector2 }
    expect(passNode._viewport?.toArray()).toEqual([0, 0, 1280, 800])
    expect(uvScale.value.toArray()).toEqual([1280 / 1281, 800 / 801])
    expect(uvOffset.value.toArray()).toEqual([0, 0])
    expect(flatland.renderPipeline?.outputNode).not.toBe(passNode)

    flatland.dispose()
  })

  it('ignores invalid view sizes without corrupting the managed projection', () => {
    const flatland = new Flatland({ viewSize: 0 })

    expect(flatland.viewSize).toBe(400)
    flatland.viewSize = NaN
    flatland.viewSize = -1

    expect(flatland.viewSize).toBe(400)
    expect(Number.isFinite(flatland.camera.projectionMatrix.elements[0])).toBe(true)
  })

  it('never replaces or rewrites a custom camera', () => {
    const custom = new OrthographicCamera(-30, 30, 15, -15)
    const flatland = new Flatland({ camera: custom })

    flatland.pixelPerfect = true
    flatland.resize(1280, 720)

    expect(flatland.camera).toBe(custom)
    expect(custom.left).toBe(-30)
    expect(custom.right).toBe(30)
  })

  it('restores the requested managed camera after a custom camera is removed', () => {
    const custom = new OrthographicCamera(-30, 30, 15, -15)
    const flatland = new Flatland({ camera: custom })
    flatland.pixelPerfect = true

    const internalCamera = Reflect.get(flatland, '_internalCamera') as OrthographicCamera
    flatland.camera = internalCamera

    expect(flatland.camera).toBeInstanceOf(PixelPerfectCamera)
  })
})

describe('Flatland — aspect property', () => {
  it('pins the aspect and updates the frustum', () => {
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
    flatland.aspect = 2

    expect(flatland.camera.right).toBe(800)
    expect(flatland.camera.left).toBe(-800)
  })

  it('rejects non-finite and non-positive values', () => {
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
    flatland.aspect = NaN
    flatland.aspect = 0
    flatland.aspect = -1
    flatland.aspect = Infinity

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBe(1)
  })

  it('treats an invalid constructor aspect as automatic instead of latching it', () => {
    const flatland = new Flatland({ viewSize: 800, aspect: 0, pixelPerfect: false })
    const { renderer } = mockRenderer(1280, 720)

    flatland.render(renderer)

    expect(flatland.aspect).toBe('auto')
    expect(flatland.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(Number.isFinite(flatland.camera.right)).toBe(true)
  })

  it('returns to automatic sizing after a fixed aspect or manual resize', () => {
    const events: string[] = []
    const flatland = new Flatland({ viewSize: 800, aspect: 2, pixelPerfect: false })
    const { renderer } = mockRenderer(1280, 720)
    flatland.setLighting(lifecycleEffect(events))

    flatland.resize(800, 800)
    // R3F restores a removed prop from a fresh no-arg instance. Flatland's
    // default getter must therefore expose the explicit auto sentinel.
    flatland.aspect = new Flatland({ pixelPerfect: false }).aspect
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
    const flatland = new Flatland({ viewSize: 800, pixelPerfect: false })
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
    // viewSize is a minimum when no viewWidth is authored. The camera keeps
    // its 1× scale and reveals the full 1920 × 1080 physical output.
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
      viewport: new Vector4(0, 0, 512, 256),
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
      viewport: new Vector4(0, 0, 512, 256),
      texture: { colorSpace: '' },
      setSize: firstSetSize,
    } as never

    flatland.render(renderer)
    expect(flatland.resolvedAspect).toBeCloseTo(2)

    flatland.renderTarget = {
      width: 300,
      height: 600,
      viewport: new Vector4(0, 0, 300, 600),
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
      viewport: new Vector4(0, 0, 2560, 1440),
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

    // DPR 2 produces a 2560 × 1440 framebuffer. At 3×, the camera uses the
    // largest full-frame integer viewport (2559 × 1440); the effect's own
    // half-resolution resources do not alter that camera framing.
    expect(flatland.resolvedAspect).toBeCloseTo(2559 / 1440)
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

  it('uses physical pixels for manually-sized canvas effects at HiDPI', () => {
    const events: string[] = []
    const flatland = new Flatland()
    const { renderer } = mockRenderer(800, 800, 2)
    flatland.setLighting(lifecycleEffect(events))
    flatland.resize(800, 800)

    flatland.render(renderer)

    expect(events).toEqual(['init', 'resize:1600x1600', 'update'])
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
