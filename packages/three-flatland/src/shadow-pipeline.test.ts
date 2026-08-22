import { describe, it, expect, vi, afterEach } from 'vitest'
import { Color, RenderTarget, Vector2 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland } from './Flatland'
import { createLightEffect } from './lights/LightEffect'
import { ShadowPipeline, LightingContext } from './ecs/traits'
import { shadowPipelineSystem } from './ecs/systems/shadowPipelineSystem'
import { vec4 } from 'three/tsl'

const LitNoShadows = createLightEffect({
  name: 'litNoShadows',
  schema: {} as const,
  needsShadows: false,
  light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
})

const LitWithShadows = createLightEffect({
  name: 'litWithShadows',
  schema: {} as const,
  needsShadows: true,
  light: () => (ctx) => vec4(ctx.color.rgb, ctx.color.a),
})

/** Helper — read the singleton ShadowPipeline trait from a Flatland's world. */
function getPipeline(flatland: Flatland) {
  const entities = flatland.world.query(ShadowPipeline)
  return entities.length > 0 ? entities[0]!.get(ShadowPipeline) : null
}

function mockRenderer(width: number, height: number) {
  return {
    getSize: (target: Vector2) => target.set(width, height),
    getDrawingBufferSize: (target: Vector2) => target.set(width, height),
    getPixelRatio: () => 1,
    getClearAlpha: () => 1,
    getClearColor: (target: Color) => target.set(0x000000),
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    setClearColor: () => {},
    render: () => {},
    autoClear: true,
  } as unknown as WebGPURenderer
}

describe('shadowPipelineSystem + ShadowPipeline trait', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('setLighting with a non-shadow effect does not allocate the pipeline', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitNoShadows())

    // Trait may exist (Flatland always bootstraps it) but generators are null.
    const pipeline = getPipeline(flatland)
    expect(pipeline?.sdfGenerator ?? null).toBeNull()
    expect(pipeline?.occlusionPass ?? null).toBeNull()
  })

  it('setLighting with a needsShadows effect eagerly allocates generators', () => {
    // T5 contract: the SDFGenerator has to exist at buildLightFn time so
    // effect shaders can capture a stable texture reference for TSL
    // `texture()` calls. Flatland.setLighting therefore allocates before
    // calling buildLightFn — the system picks up the existing instances
    // on its first tick and just runs init()/resize() against them.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const pipeline = getPipeline(flatland)
    expect(pipeline?.sdfGenerator).not.toBeNull()
    expect(pipeline?.occlusionPass).not.toBeNull()

    // Running the system afterwards is idempotent — it shouldn't replace
    // the existing allocations.
    const sdfBefore = pipeline!.sdfGenerator
    const lctx = flatland.world.query(LightingContext)[0]!.get(LightingContext)
    lctx.renderer = {
      getSize: (t: { set: (x: number, y: number) => void }) => {
        t.set(1920, 1080)
        return t
      },
    } as unknown as typeof lctx.renderer
    lctx.surfaceSize.set(1920, 1080)
    lctx.camera = flatland.camera
    lctx.scene = null
    shadowPipelineSystem(flatland.world)
    expect(pipeline!.sdfGenerator).toBe(sdfBefore)
  })

  it('resizes the live shadow pipeline when render() observes render-target swaps', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())
    const pipeline = getPipeline(flatland)!
    const sdfInit = vi.spyOn(pipeline.sdfGenerator!, 'init').mockImplementation(() => {})
    const sdfResize = vi.spyOn(pipeline.sdfGenerator!, 'resize').mockImplementation(() => {})
    vi.spyOn(pipeline.sdfGenerator!, 'generate').mockImplementation(() => {})
    const occlusionResize = vi.spyOn(pipeline.occlusionPass!, 'resize').mockImplementation(() => {})
    vi.spyOn(pipeline.occlusionPass!, 'render').mockImplementation(() => {})
    const renderer = mockRenderer(1280, 720)

    flatland.renderTarget = new RenderTarget(512, 256)
    flatland.render(renderer)

    expect(sdfInit).toHaveBeenCalledWith(256, 128)
    expect(occlusionResize).toHaveBeenCalledWith(512, 256)
    expect(pipeline.width).toBe(256)
    expect(pipeline.height).toBe(128)

    flatland.renderTarget = new RenderTarget(300, 600)
    flatland.render(renderer)

    expect(sdfResize).toHaveBeenCalledWith(150, 300)
    expect(occlusionResize).toHaveBeenLastCalledWith(300, 600)
    expect(pipeline.width).toBe(150)
    expect(pipeline.height).toBe(300)
  })

  it('switching from shadow → no-shadow tears down on next system tick', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    // Force allocation by running the system with a fake renderer (as above).
    const lctx = flatland.world.query(LightingContext)[0]!.get(LightingContext)
    lctx.renderer = {
      getSize: (t: { set: (x: number, y: number) => void }) => {
        t.set(256, 256)
        return t
      },
    } as unknown as typeof lctx.renderer
    lctx.surfaceSize.set(256, 256)
    lctx.camera = flatland.camera
    lctx.scene = null
    shadowPipelineSystem(flatland.world)
    expect(getPipeline(flatland)!.sdfGenerator).not.toBeNull()

    // Swap to a non-shadow effect — teardown happens when the system runs.
    flatland.setLighting(new LitNoShadows())
    shadowPipelineSystem(flatland.world)

    const pipeline = getPipeline(flatland)
    expect(pipeline?.sdfGenerator ?? null).toBeNull()
    expect(pipeline?.occlusionPass ?? null).toBeNull()
    expect(pipeline?.initialized ?? true).toBe(false)
  })

  it('lightEffectSystem sources the SDF handle from ShadowPipeline (no mirror)', async () => {
    // Contract: there is exactly one SDFGenerator owner (ShadowPipeline).
    // Consumers (lightEffectSystem building the effect runtime context)
    // pull it live from that trait. LightingContext does not carry a
    // mirrored copy — this test guards against regression to a double-
    // sourced layout.
    const { lightEffectSystem } = await import('./ecs/systems/lightEffectSystem')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const lctx = flatland.world.query(LightingContext)[0]!.get(LightingContext)
    lctx.renderer = {
      getSize: (t: { set: (x: number, y: number) => void }) => {
        t.set(256, 256)
        return t
      },
    } as unknown as typeof lctx.renderer
    lctx.surfaceSize.set(256, 256)
    lctx.camera = flatland.camera
    lctx.scene = null

    shadowPipelineSystem(flatland.world)
    const pipeline = getPipeline(flatland)!
    expect(pipeline.sdfGenerator).not.toBeNull()

    // LightingContext must NOT carry a mirrored sdfGenerator field.
    expect((lctx as unknown as Record<string, unknown>).sdfGenerator).toBeUndefined()

    // Smoke: lightEffectSystem can still run without it (no throw) — the
    // runtime context it builds internally pulls from ShadowPipeline.
    expect(() => lightEffectSystem(flatland.world)).not.toThrow()
  })

  it('Flatland.dispose() releases trait-owned GPU resources', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    const lctx = flatland.world.query(LightingContext)[0]!.get(LightingContext)
    lctx.renderer = {
      getSize: (t: { set: (x: number, y: number) => void }) => {
        t.set(256, 256)
        return t
      },
    } as unknown as typeof lctx.renderer
    lctx.surfaceSize.set(256, 256)
    lctx.camera = flatland.camera
    lctx.scene = null
    shadowPipelineSystem(flatland.world)
    const sdf = getPipeline(flatland)!.sdfGenerator!
    const disposeSpy = vi.spyOn(sdf, 'dispose')

    flatland.dispose()

    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
