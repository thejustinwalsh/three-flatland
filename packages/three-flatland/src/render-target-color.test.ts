import {
  HalfFloatType,
  LinearSRGBColorSpace,
  RenderTarget,
  SRGBColorSpace,
  Vector2,
  Vector4,
  type Scene,
  type Camera,
} from 'three'
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu'
import type PassNode from 'three/src/nodes/display/PassNode.js'
import { vec4 } from 'three/tsl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Flatland } from './Flatland'
import { beginDebugPass, endDebugPass } from './debug/debug-sink'

vi.mock('./debug/debug-sink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./debug/debug-sink')>()
  return {
    ...actual,
    beginDebugPass: vi.fn(),
    endDebugPass: vi.fn(),
  }
})

function createPipeline(render = vi.fn()): RenderPipeline {
  return {
    outputNode: vec4(0, 0, 0, 1),
    outputColorTransform: true,
    needsUpdate: false,
    render,
  } as unknown as RenderPipeline
}

function createPassNode() {
  return {
    setSize: vi.fn(),
    setViewport: vi.fn(),
  } as unknown as PassNode
}

function createRenderer(initialTarget: RenderTarget | null = null) {
  let currentTarget = initialTarget
  const viewport = Object.assign(new Vector4(0, 0, 640, 360), { minDepth: 0.2, maxDepth: 0.8 })
  const setRenderTarget = vi.fn((target: RenderTarget | null) => {
    currentTarget = target
  })

  const renderer = {
    _canvasTarget: { _viewport: viewport },
    autoClear: true,
    getPixelRatio: () => 1,
    getRenderTarget: () => currentTarget,
    getViewport: (target: Vector4) => target.copy(viewport),
    getSize: (target: Vector2) => target.set(640, 360),
    getDrawingBufferSize: (target: Vector2) => target.set(640, 360),
    render: vi.fn((_scene: Scene, _camera: Camera) => undefined),
    setClearColor: vi.fn(),
    setRenderTarget,
    setViewport: (x: number | Vector4, y?: number, width?: number, height?: number, minDepth = 0, maxDepth = 1) => {
      if (x instanceof Vector4) viewport.copy(x)
      else viewport.set(x, y!, width!, height!)
      viewport.minDepth = minDepth
      viewport.maxDepth = maxDepth
    },
  } as unknown as WebGPURenderer

  return { renderer, setRenderTarget, viewport }
}

function markPipelineAutoManaged(flatland: Flatland): void {
  const internal = flatland as unknown as {
    _autoRenderPipeline: boolean
    _passNode: PassNode
    _installAutoPassSize(passNode: PassNode): void
  }
  internal._autoRenderPipeline = true
  internal._installAutoPassSize(internal._passNode)
  flatland.renderTarget = flatland.renderTarget
}

describe('Flatland render-target color management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults an untagged 2D target to sRGB', () => {
    const target = new RenderTarget(64, 64)

    new Flatland({ renderTarget: target })

    expect(target.texture.colorSpace).toBe(SRGBColorSpace)
  })

  it('defaults every untagged MRT attachment to sRGB', () => {
    const target = new RenderTarget(64, 64, { count: 2 })

    new Flatland({ renderTarget: target })

    expect(target.textures).toHaveLength(2)
    expect(target.textures.every((texture) => texture.colorSpace === SRGBColorSpace)).toBe(true)
  })

  it('preserves an explicit linear HDR target', () => {
    const target = new RenderTarget(64, 64, {
      colorSpace: LinearSRGBColorSpace,
      type: HalfFloatType,
    })

    new Flatland({ renderTarget: target })

    expect(target.texture.colorSpace).toBe(LinearSRGBColorSpace)
    expect(target.texture.type).toBe(HalfFloatType)
  })

  it('disables the display transform for a pipeline that renders offscreen', () => {
    const target = new RenderTarget(64, 64)
    const pipeline = createPipeline()
    const flatland = new Flatland({ renderTarget: target })

    flatland.setRenderPipeline(pipeline, createPassNode())
    markPipelineAutoManaged(flatland)

    expect(pipeline.outputColorTransform).toBe(false)
    expect(pipeline.needsUpdate).toBe(true)

    pipeline.needsUpdate = false
    flatland.renderTarget = null

    expect(pipeline.outputColorTransform).toBe(true)
    expect(pipeline.needsUpdate).toBe(true)
  })

  it('binds the offscreen target for the pipeline and restores renderer state', () => {
    const previousTarget = new RenderTarget(8, 8)
    const target = new RenderTarget(64, 64)
    const pipeline = createPipeline()
    const flatland = new Flatland({ renderTarget: target })
    const { renderer, setRenderTarget } = createRenderer(previousTarget)
    const passNode = createPassNode()
    const originalSetSize = passNode.setSize
    flatland.setRenderPipeline(pipeline, passNode)
    markPipelineAutoManaged(flatland)

    passNode.setSize(640, 360)
    expect(originalSetSize).toHaveBeenCalledWith(64, 64)

    flatland.render(renderer)

    expect(setRenderTarget.mock.calls).toEqual([[target], [previousTarget]])
    expect(pipeline.render).toHaveBeenCalledOnce()
  })

  it('restores renderer state when the pipeline throws', () => {
    const previousTarget = new RenderTarget(8, 8)
    const target = new RenderTarget(64, 64)
    const pipeline = createPipeline(
      vi.fn(() => {
        throw new Error('pipeline failed')
      })
    )
    const flatland = new Flatland({ renderTarget: target })
    const { renderer, setRenderTarget } = createRenderer(previousTarget)
    flatland.setRenderPipeline(pipeline, createPassNode())
    markPipelineAutoManaged(flatland)

    expect(() => flatland.render(renderer)).toThrow('pipeline failed')
    expect(setRenderTarget.mock.calls).toEqual([[target], [previousTarget]])
    expect(beginDebugPass).toHaveBeenCalledWith('main.post', renderer)
    expect(endDebugPass).toHaveBeenCalledWith(renderer)
  })

  it('restores viewport coordinates and depth range when target lookup throws', () => {
    const flatland = new Flatland()
    const { renderer, viewport } = createRenderer()
    renderer.getRenderTarget = () => {
      throw new Error('target lookup failed')
    }

    expect(() => flatland.render(renderer)).toThrow('target lookup failed')
    expect(viewport.toArray()).toEqual([0, 0, 640, 360])
    expect(viewport.minDepth).toBe(0.2)
    expect(viewport.maxDepth).toBe(0.8)
  })

  it('restores autoClear and the render target when direct rendering throws', () => {
    const previousTarget = new RenderTarget(8, 8)
    const target = new RenderTarget(64, 64)
    const flatland = new Flatland({ renderTarget: target })
    const { renderer, setRenderTarget } = createRenderer(previousTarget)
    renderer.autoClear = false
    vi.mocked(renderer.render).mockImplementation(() => {
      throw new Error('direct render failed')
    })

    expect(() => flatland.render(renderer)).toThrow('direct render failed')
    expect(renderer.autoClear).toBe(false)
    expect(setRenderTarget.mock.calls).toEqual([[target], [previousTarget]])
    expect(beginDebugPass).toHaveBeenCalledWith('main', renderer)
    expect(endDebugPass).toHaveBeenCalledWith(renderer)
  })

  it('binds the default framebuffer when renderTarget is null', () => {
    const previousTarget = new RenderTarget(8, 8)
    const pipeline = createPipeline()
    const flatland = new Flatland()
    const { renderer, setRenderTarget } = createRenderer(previousTarget)
    flatland.setRenderPipeline(pipeline, createPassNode())

    flatland.render(renderer)

    expect(setRenderTarget.mock.calls).toEqual([[null], [previousTarget]])
    expect(pipeline.outputColorTransform).toBe(true)
  })

  it('preserves output control for a user-provided pipeline', () => {
    const target = new RenderTarget(64, 64)
    const pipeline = createPipeline()
    pipeline.outputColorTransform = false
    const flatland = new Flatland()
    const { renderer } = createRenderer()

    flatland.setRenderPipeline(pipeline, createPassNode())
    flatland.render(renderer)
    flatland.renderTarget = target
    flatland.renderTarget = null

    expect(pipeline.outputColorTransform).toBe(false)
  })
})
