import { describe, it, expect, vi, afterEach } from 'vitest'
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

  it('running the system with a needsShadows effect allocates generators', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flatland = new Flatland()
    flatland.setLighting(new LitWithShadows())

    // Before the system runs, the trait exists but generators are null.
    const pipelineBefore = getPipeline(flatland)
    expect(pipelineBefore?.sdfGenerator ?? null).toBeNull()

    // Simulate running the system (without a renderer it should bail early).
    // The allocation path only fires with renderer + camera present — that's
    // guaranteed inside Flatland.render, but for this test we populate the
    // LightingContext runtime fields manually to exercise allocation.
    const lctxEntities = flatland.world.query(LightingContext)
    const lctx = lctxEntities[0]!.get(LightingContext)
    // Fake minimal renderer / camera — the system only needs .getSize and
    // .isScene on the camera parent chain isn't walked anymore.
    lctx.renderer = {
      getSize: (target: { set: (x: number, y: number) => void }) => {
        target.set(1920, 1080)
        return target
      },
      // The system only calls getSize for allocation; render calls require
      // a full renderer. We skip the render branch by providing no scene.
    } as unknown as typeof lctx.renderer
    lctx.camera = flatland.camera
    // Deliberately leave lctx.scene = null so the render branch is skipped;
    // allocation still runs.
    lctx.scene = null

    shadowPipelineSystem(flatland.world)

    const pipelineAfter = getPipeline(flatland)
    expect(pipelineAfter?.sdfGenerator).not.toBeNull()
    expect(pipelineAfter?.occlusionPass).not.toBeNull()
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

  it('publishes the live SDFGenerator handle to LightingContext for consumers', () => {
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
    lctx.camera = flatland.camera
    lctx.scene = null

    shadowPipelineSystem(flatland.world)

    const pipeline = getPipeline(flatland)!
    expect(lctx.sdfGenerator).toBe(pipeline.sdfGenerator)
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
    lctx.camera = flatland.camera
    lctx.scene = null
    shadowPipelineSystem(flatland.world)
    const sdf = getPipeline(flatland)!.sdfGenerator!
    const disposeSpy = vi.spyOn(sdf, 'dispose')

    flatland.dispose()

    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
