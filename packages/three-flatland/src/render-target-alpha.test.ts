import {
  Color,
  RenderTarget,
  Texture,
  Vector2,
  Vector4,
  type Camera,
  type ColorRepresentation,
  type Scene,
} from 'three'
import type { PassNode, RenderPipeline, WebGPURenderer } from 'three/webgpu'
import { pass as scenePass, vec4 } from 'three/tsl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Flatland } from './Flatland'
import { createPassEffect } from './pipeline/PassEffect'

function createPipeline(render = vi.fn()): RenderPipeline {
  return {
    outputNode: vec4(0, 0, 0, 0),
    outputColorTransform: true,
    needsUpdate: false,
    render,
  } as unknown as RenderPipeline
}

function createPassNode(): PassNode {
  return {
    setSize: vi.fn(),
    setViewport: vi.fn(),
  } as unknown as PassNode
}

function createRenderer(
  initialTarget: RenderTarget | null = null,
  initialClearColor: ColorRepresentation = '#123456',
  initialClearAlpha = 0.75
) {
  let currentTarget = initialTarget
  const clearColor = new Color(initialClearColor)
  let clearAlpha = initialClearAlpha
  const viewport = Object.assign(new Vector4(0, 0, 64, 64), { minDepth: 0, maxDepth: 1 })
  const renderer = {
    _canvasTarget: { _viewport: viewport },
    autoClear: true,
    contextNode: null,
    opaque: true,
    transparent: true,
    getClearAlpha: () => clearAlpha,
    getClearColor: (target: Color) => target.copy(clearColor),
    getPixelRatio: () => 1,
    getMRT: () => null,
    getOutputRenderTarget: () => null,
    getRenderTarget: () => currentTarget,
    getViewport: (target: Vector4) => target.copy(viewport),
    getSize: (target: Vector2) => target.set(64, 64),
    getDrawingBufferSize: (target: Vector2) => target.set(64, 64),
    render: vi.fn((_scene: Scene, _camera: Camera) => undefined),
    setClearColor: vi.fn((value: ColorRepresentation, alpha = 1) => {
      clearColor.set(value)
      clearAlpha = alpha
    }),
    setMRT: vi.fn(),
    setRenderTarget: vi.fn((target: RenderTarget | null) => {
      currentTarget = target
    }),
    setViewport: vi.fn(),
  } as unknown as WebGPURenderer

  return renderer
}

function expectClearState(renderer: WebGPURenderer, color: string, alpha: number): void {
  expect(renderer.getClearColor(new Color()).getHexString()).toBe(color)
  expect(renderer.getClearAlpha()).toBe(alpha)
}

function installManualPipeline(flatland: Flatland, render = vi.fn()): RenderPipeline {
  const pipeline = createPipeline(render)
  flatland.setRenderPipeline(pipeline, createPassNode())
  return pipeline
}

const IdentityPass = createPassEffect({
  name: 'renderTargetAlphaIdentity',
  schema: {},
  pass: () => (input) => input,
})

function installAutomaticPipeline(flatland: Flatland, renderer: WebGPURenderer): RenderPipeline {
  const effect = new IdentityPass()
  flatland.addPass(effect)

  const ensurePipeline = Reflect.get(flatland, '_ensureRenderPipeline') as (renderer: WebGPURenderer) => void
  ensurePipeline.call(flatland, renderer)

  const pipeline = flatland.renderPipeline!
  pipeline.render = vi.fn()
  return pipeline
}

describe('Flatland render-target alpha', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the same transparent clear state for direct rendering', () => {
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target, clearColor: '#050812', clearAlpha: 0 })
    const renderer = createRenderer()
    renderer.autoClear = false

    flatland.render(renderer)

    expect(flatland.scene.background).toBeNull()
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0)
    expect(renderer.autoClear).toBe(false)
    expectClearState(renderer, '123456', 0.75)
  })

  it('uses the same transparent clear state for a manual pipeline', () => {
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target, clearColor: '#050812', clearAlpha: 0 })
    const renderer = createRenderer()
    renderer.autoClear = false
    const render = vi.fn(() => {
      expect(flatland.scene.background).toBeNull()
      expect(renderer.autoClear).toBe(false)
      expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0)
    })
    installManualPipeline(flatland, render)

    flatland.render(renderer)

    expect(render).toHaveBeenCalledOnce()
    expect(renderer.autoClear).toBe(false)
  })

  it('preserves transparent clear state for an automatic pipeline', () => {
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target, clearColor: '#050812', clearAlpha: 0 })
    const renderer = createRenderer()
    const pipeline = installAutomaticPipeline(flatland, renderer)
    pipeline.render = vi.fn(() => {
      expect(flatland.scene.background).toBeNull()
      expect(renderer.autoClear).toBe(true)
      expectClearState(renderer, '000000', 0)
    })

    flatland.render(renderer)

    expect(flatland.scene.background).toBeNull()
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0)
    expect(pipeline.render).toHaveBeenCalledOnce()
    expectClearState(renderer, '123456', 0.75)
  })

  it('uses direct rendering after an automatic pipeline is disabled', () => {
    const flatland = new Flatland({ clearColor: '#050812', clearAlpha: 0 })
    const renderer = createRenderer()
    const pipeline = installAutomaticPipeline(flatland, renderer)
    flatland.clearPasses()

    flatland.render(renderer)

    expect(pipeline.render).not.toHaveBeenCalled()
    expect(renderer.render).toHaveBeenCalledOnce()
    expect(flatland.scene.background).toBeNull()
    expect(renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0)
  })

  it('preserves fractional clear alpha through the pipeline setup', () => {
    const flatland = new Flatland({ clearColor: '#050812', clearAlpha: 0.5 })
    const renderer = createRenderer()
    installManualPipeline(flatland)

    flatland.render(renderer)

    expect(flatland.scene.background).toBeNull()
    expect(renderer.setClearColor).toHaveBeenCalledWith(flatland.clearColor, 0.5)
    expectClearState(renderer, '123456', 0.75)
  })

  it('uses the authored color for an opaque pipeline background', () => {
    const flatland = new Flatland({ clearColor: '#050812', clearAlpha: 1 })
    const renderer = createRenderer()
    installManualPipeline(flatland)

    flatland.render(renderer)

    expect(flatland.scene.background).toBe(flatland.clearColor)
    const [clearColor, clearAlpha] = vi.mocked(renderer.setClearColor).mock.calls[0]!
    expect(clearColor).toBeInstanceOf(Color)
    expect((clearColor as Color).getHexString()).toBe('050812')
    expect(clearAlpha).toBe(1)
    expectClearState(renderer, '123456', 0.75)
  })

  it('uses an opaque authored clear for a pipeline when autoClear is disabled', () => {
    const flatland = new Flatland({ autoClear: false, clearColor: '#050812', clearAlpha: 1 })
    const renderer = createRenderer()
    renderer.autoClear = false
    const render = vi.fn(() => {
      expect(renderer.autoClear).toBe(false)
      expect(flatland.scene.background).toBe(flatland.clearColor)
      expectClearState(renderer, '050812', 1)
    })
    installManualPipeline(flatland, render)

    flatland.render(renderer)

    expect(render).toHaveBeenCalledOnce()
    expect(renderer.autoClear).toBe(false)
    expectClearState(renderer, '123456', 0.75)
  })

  it('preserves a user-authored pipeline background', () => {
    const flatland = new Flatland({ clearAlpha: 0 })
    const renderer = createRenderer()
    const background = new Texture()
    flatland.scene.background = background
    installManualPipeline(flatland, () => {
      expect(flatland.scene.background).toBe(background)
    })

    flatland.render(renderer)

    expect(flatland.scene.background).toBe(background)
  })

  it.each([0, 1])('does not clear direct rendering when autoClear is disabled (clearAlpha=%s)', (clearAlpha) => {
    const flatland = new Flatland({ autoClear: false, clearColor: '#050812', clearAlpha })
    const renderer = createRenderer()
    vi.mocked(renderer.render).mockImplementation(() => {
      expect(renderer.autoClear).toBe(false)
      expect(renderer.setClearColor).not.toHaveBeenCalled()
      expectClearState(renderer, '123456', 0.75)
      expect(flatland.scene.background).toBeNull()
    })

    flatland.render(renderer)

    expect(renderer.setClearColor).toHaveBeenCalledOnce()
    expect(renderer.autoClear).toBe(true)
    expectClearState(renderer, '123456', 0.75)
  })

  it('seeds a real PassNode clear when autoClear is disabled', () => {
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target, autoClear: false, clearAlpha: 0 })
    const renderer = createRenderer(null, '#ff0000', 1)
    const inputPass = scenePass(flatland.scene, flatland.camera)
    vi.mocked(renderer.render).mockImplementation(() => {
      expect(renderer.autoClear).toBe(true)
      expectClearState(renderer, '000000', 0)
    })
    installManualPipeline(flatland, () => {
      const frame = { renderer } as unknown as Parameters<PassNode['updateBefore']>[0]
      inputPass.updateBefore(frame)
    })

    flatland.render(renderer)

    expect(renderer.render).toHaveBeenCalledOnce()
    expect(renderer.autoClear).toBe(true)
    expectClearState(renderer, 'ff0000', 1)
  })

  it('captures caller clear state before internal pre-passes run', () => {
    const flatland = new Flatland({ autoClear: false })
    const renderer = createRenderer(null, '#123456', 0.75)
    vi.spyOn(flatland.scene, 'updateMatrixWorld').mockImplementation(() => {
      renderer.setClearColor('#abcdef', 1)
    })
    vi.mocked(renderer.render).mockImplementation(() => {
      expectClearState(renderer, 'abcdef', 1)
    })

    flatland.render(renderer)

    expectClearState(renderer, '123456', 0.75)
  })

  it('restores renderer state when the pipeline throws', () => {
    const previousTarget = new RenderTarget(8, 8)
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target, clearAlpha: 0 })
    const renderer = createRenderer(previousTarget)
    renderer.autoClear = false
    installManualPipeline(flatland, () => {
      throw new Error('pipeline failed')
    })

    expect(() => flatland.render(renderer)).toThrow('pipeline failed')
    expect(renderer.autoClear).toBe(false)
    expect(renderer.getRenderTarget()).toBe(previousTarget)
    expectClearState(renderer, '123456', 0.75)
  })
})
