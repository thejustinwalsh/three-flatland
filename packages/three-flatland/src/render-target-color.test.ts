import {
  HalfFloatType,
  LinearSRGBColorSpace,
  RenderTarget,
  SRGBColorSpace,
  Vector2,
  type Scene,
  type Camera,
} from 'three'
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu'
import type PassNode from 'three/src/nodes/display/PassNode.js'
import { vec4 } from 'three/tsl'
import { describe, expect, it, vi } from 'vitest'
import { Flatland } from './Flatland'

function createPipeline(render = vi.fn()): RenderPipeline {
  return {
    outputNode: vec4(0, 0, 0, 1),
    outputColorTransform: true,
    needsUpdate: false,
    render,
  } as unknown as RenderPipeline
}

function createRenderer(initialTarget: RenderTarget | null = null) {
  let currentTarget = initialTarget
  const setRenderTarget = vi.fn((target: RenderTarget | null) => {
    currentTarget = target
  })

  const renderer = {
    autoClear: true,
    getPixelRatio: () => 1,
    getRenderTarget: () => currentTarget,
    getSize: (target: Vector2) => target.set(640, 360),
    render: vi.fn((_scene: Scene, _camera: Camera) => undefined),
    setClearColor: vi.fn(),
    setRenderTarget,
  } as unknown as WebGPURenderer

  return { renderer, setRenderTarget }
}

function markPipelineAutoManaged(flatland: Flatland): void {
  const internal = flatland as unknown as { _autoRenderPipeline: boolean }
  internal._autoRenderPipeline = true
  flatland.renderTarget = flatland.renderTarget
}

describe('Flatland render-target color management', () => {
  it('defaults an untagged 2D target to sRGB', () => {
    const target = new RenderTarget(64, 64)

    new Flatland({ renderTarget: target })

    expect(target.texture.colorSpace).toBe(SRGBColorSpace)
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

    flatland.setRenderPipeline(pipeline, {} as PassNode)
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
    flatland.setRenderPipeline(pipeline, {} as PassNode)
    markPipelineAutoManaged(flatland)

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
    flatland.setRenderPipeline(pipeline, {} as PassNode)
    markPipelineAutoManaged(flatland)

    expect(() => flatland.render(renderer)).toThrow('pipeline failed')
    expect(setRenderTarget.mock.calls).toEqual([[target], [previousTarget]])
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
  })

  it('binds the default framebuffer when renderTarget is null', () => {
    const previousTarget = new RenderTarget(8, 8)
    const pipeline = createPipeline()
    const flatland = new Flatland()
    const { renderer, setRenderTarget } = createRenderer(previousTarget)
    flatland.setRenderPipeline(pipeline, {} as PassNode)

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

    flatland.setRenderPipeline(pipeline, {} as PassNode)
    flatland.render(renderer)
    flatland.renderTarget = target
    flatland.renderTarget = null

    expect(pipeline.outputColorTransform).toBe(false)
  })
})
