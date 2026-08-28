import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OrthographicCamera, Scene, NearestFilter, LinearFilter, Vector2 } from 'three'
import { createWorld, select, type World } from '../runtime'
import { readRequired } from '../testUtils.type-test'
import { shadowPipelineSystem } from './shadowPipelineSystem'
import { BatchRegistry, LightingContext, ShadowPipeline } from '../traits'
import { createLightEffect } from '../../lights/LightEffect'
import type { ColorTransformFn } from '../../materials/Sprite2DMaterial'

// ============================================
// Mocks
// ============================================

const stubLightFn: ColorTransformFn = (ctx) => ctx.color

/** Minimal renderer stub — only getSize is exercised by the system. */
function makeRenderer(width = 800, height = 600) {
  return {
    getSize: vi.fn((target: { x: number; y: number }) => {
      target.x = width
      target.y = height
      return target
    }),
  }
}

/** Spy SDFGenerator — tracks generate/init/resize/setWorldBounds/setFilter/dispose. */
function makeSdfGenerator() {
  return {
    init: vi.fn(),
    resize: vi.fn(),
    setWorldBounds: vi.fn(),
    setFilter: vi.fn(),
    generate: vi.fn(),
    dispose: vi.fn(),
  }
}

/** Spy OcclusionPass — tracks render/resize/dispose. */
function makeOcclusionPass() {
  return {
    resolutionScale: 0.5,
    renderTarget: {},
    render: vi.fn(),
    resize: vi.fn(),
    setMipmapsEnabled: vi.fn(),
    dispose: vi.fn(),
  }
}

// ============================================
// Helpers
// ============================================

function ShadowEffectClass() {
  const Effect = createLightEffect({
    name: 'shadowGateTest',
    schema: { ambientIntensity: 0.2 },
    needsShadows: true,
    light: () => stubLightFn,
  })
  return Effect
}

interface SetupOpts {
  occludersDirty?: boolean
  shadowPipelineMode?: 'sdf' | 'occlusion'
  /** Overrides merged onto the effect's `constants` (DefaultLightEffect-style). */
  constants?: Record<string, unknown>
}

function setup(world: World, opts: SetupOpts = {}) {
  const Effect = opts.shadowPipelineMode
    ? createLightEffect({
        name: 'shadowRepresentationTest',
        schema: { ambientIntensity: 0.2 },
        needsShadows: true,
        shadowPipelineMode: opts.shadowPipelineMode,
        light: () => stubLightFn,
      })
    : ShadowEffectClass()
  Effect._initialize()
  const effect = new Effect()

  if (opts.constants) {
    const e = effect as unknown as { constants: Record<string, unknown> }
    e.constants = { ...e.constants, ...opts.constants }
  }

  const renderer = makeRenderer()
  const scene = new Scene()
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100)

  // Pre-seed the pipeline trait with spy generators so the system reuses
  // them rather than constructing real GPU objects.
  const sdfGenerator = makeSdfGenerator()
  const occlusionPass = makeOcclusionPass()
  world.spawn(
    ShadowPipeline({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sdfGenerator: sdfGenerator as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      occlusionPass: occlusionPass as any,
    })
  )

  world.spawn(
    LightingContext({
      effect,
      surfaceSize: new Vector2(800, 600),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer: renderer as any,
      camera,
      scene,
    })
  )

  // Registry drives the occluder-dirty gate; control it manually so the
  // gate is isolated from transformSync's blanket dirtying.
  const registryEntity = world.spawn(BatchRegistry({ occludersDirty: opts.occludersDirty ?? true }))

  function setOccludersDirty(value: boolean) {
    const reg = readRequired(world, registryEntity, BatchRegistry)
    reg.occludersDirty = value
  }

  return { sdfGenerator, occlusionPass, camera, setOccludersDirty }
}

// ============================================
// Tests
// ============================================

describe('shadowPipelineSystem — occluder-dirty gate', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.dispose()
  })

  it('generates on the first run', () => {
    const { sdfGenerator, occlusionPass } = setup(world, { occludersDirty: true })

    shadowPipelineSystem(world)

    expect(occlusionPass.render).toHaveBeenCalledTimes(1)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(1)
  })

  it('keeps the binary caster pass but retires the SDF for occlusion-only effects', () => {
    const { sdfGenerator, occlusionPass } = setup(world, {
      occludersDirty: true,
      shadowPipelineMode: 'occlusion',
    })

    shadowPipelineSystem(world)

    const pipelineEntity = world.view(select(ShadowPipeline))[0]!
    const pipeline = readRequired(world, pipelineEntity, ShadowPipeline)
    expect(pipeline.sdfGenerator).toBeNull()
    expect(pipeline.occlusionPass).not.toBeNull()
    expect(sdfGenerator.dispose).toHaveBeenCalledOnce()
    expect(sdfGenerator.generate).not.toHaveBeenCalled()
    expect(occlusionPass.render).toHaveBeenCalledOnce()
  })

  it('sizes shadows from the canonical surface without querying the renderer', () => {
    const { sdfGenerator, occlusionPass } = setup(world)
    const ctx = readRequired(world, world.view(select(LightingContext))[0]!, LightingContext)
    ctx.surfaceSize.set(320, 180)
    const renderer = ctx.renderer as unknown as ReturnType<typeof makeRenderer>

    shadowPipelineSystem(world)

    expect(renderer.getSize).not.toHaveBeenCalled()
    expect(sdfGenerator.init).toHaveBeenCalledWith(160, 90)
    expect(occlusionPass.resize).toHaveBeenCalledWith(320, 180)
  })

  it('does not resize either scaled shadow resource when rounding keeps their size unchanged', () => {
    const { sdfGenerator, occlusionPass, setOccludersDirty } = setup(world)
    const ctx = readRequired(world, world.view(select(LightingContext))[0]!, LightingContext)
    ctx.surfaceSize.set(512, 512)
    shadowPipelineSystem(world)

    sdfGenerator.resize.mockClear()
    occlusionPass.resize.mockClear()
    setOccludersDirty(false)
    ctx.surfaceSize.set(513, 513)
    shadowPipelineSystem(world)

    expect(sdfGenerator.resize).not.toHaveBeenCalled()
    expect(occlusionPass.resize).not.toHaveBeenCalled()
  })

  it('skips regen when occludersDirty=false and camera unchanged', () => {
    const { sdfGenerator, setOccludersDirty } = setup(world, { occludersDirty: true })

    // First run generates (mustRegen via init).
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(1)

    // Second run: nothing dirty, camera unchanged → skip.
    setOccludersDirty(false)
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(1)
  })

  it('regenerates when occludersDirty becomes true', () => {
    const { sdfGenerator, setOccludersDirty } = setup(world, { occludersDirty: true })

    shadowPipelineSystem(world)
    setOccludersDirty(false)
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(1)

    setOccludersDirty(true)
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(2)
  })

  it('regenerates when the camera frustum or position changes', () => {
    const { sdfGenerator, camera, setOccludersDirty } = setup(world, {
      occludersDirty: true,
    })

    shadowPipelineSystem(world)
    setOccludersDirty(false)
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(1)

    // Change a frustum bound (resize). Still occludersDirty=false.
    camera.right = 20
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(2)

    // Now move the camera (pan). Still occludersDirty=false.
    setOccludersDirty(false)
    camera.position.x = 5
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(3)

    // Zoom changes the projection without touching the raw frustum bounds —
    // it must still trigger a regen (else shadows freeze on zoom).
    setOccludersDirty(false)
    camera.zoom = 2
    shadowPipelineSystem(world)
    expect(sdfGenerator.generate).toHaveBeenCalledTimes(4)
  })
})

describe('shadowPipelineSystem — shadowFilter resolution', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.dispose()
  })

  it("applies LinearFilter for 'auto' + shadowPixelSnapEnabled=false", () => {
    const { sdfGenerator } = setup(world, {
      constants: { shadowFilter: 'auto', shadowPixelSnapEnabled: false },
    })
    shadowPipelineSystem(world)
    expect(sdfGenerator.setFilter).toHaveBeenLastCalledWith(LinearFilter)
  })

  it("applies NearestFilter for 'auto' + shadowPixelSnapEnabled=true", () => {
    const { sdfGenerator } = setup(world, {
      constants: { shadowFilter: 'auto', shadowPixelSnapEnabled: true },
    })
    shadowPipelineSystem(world)
    expect(sdfGenerator.setFilter).toHaveBeenLastCalledWith(NearestFilter)
  })

  it("forces NearestFilter when shadowFilter='nearest' regardless of snap", () => {
    const { sdfGenerator } = setup(world, {
      constants: { shadowFilter: 'nearest', shadowPixelSnapEnabled: false },
    })
    shadowPipelineSystem(world)
    expect(sdfGenerator.setFilter).toHaveBeenLastCalledWith(NearestFilter)
  })

  it("forces LinearFilter when shadowFilter='linear' regardless of snap", () => {
    const { sdfGenerator } = setup(world, {
      constants: { shadowFilter: 'linear', shadowPixelSnapEnabled: true },
    })
    shadowPipelineSystem(world)
    expect(sdfGenerator.setFilter).toHaveBeenLastCalledWith(LinearFilter)
  })
})
