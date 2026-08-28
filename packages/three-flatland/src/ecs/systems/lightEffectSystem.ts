import { select, type World } from '../runtime'
import { LightingContext, ShadowPipeline } from '../traits'
import type { LightEffectRuntimeContext } from '../../lights/LightEffect'

const LightingContexts = select(LightingContext)
const ShadowPipelines = select(ShadowPipeline)

// One scratch context per world keeps the per-frame path allocation-free
// after warmup without sharing mutable state across synchronously nested
// renders. Terminal owners explicitly delete their entry so a retained public
// world handle cannot keep renderer/camera state alive until that handle is
// itself collected.
const _runtimeContexts = new WeakMap<World, LightEffectRuntimeContext>()

/** Release a world's renderer-bearing scratch context during terminal disposal. @internal */
export function releaseLightEffectRuntimeContext(world: World): boolean {
  return _runtimeContexts.delete(world)
}

function runtimeContextFor(world: World): LightEffectRuntimeContext {
  let context = _runtimeContexts.get(world)
  if (!context) {
    context = {
      renderer: null,
      camera: null,
      scene: null,
      lightStore: null,
      sdfGenerator: null,
      occlusionTexture: null,
      lights: [],
      worldSize: null,
      worldOffset: null,
    } as unknown as LightEffectRuntimeContext
    _runtimeContexts.set(world, context)
  }
  return context
}

/**
 * Run LightEffect lifecycle: lazy init, ordered surface resize, and update.
 *
 * Self-gating: no-ops if LightingContext doesn't exist, effect is disabled,
 * or runtime context (renderer/camera) is not yet available.
 *
 * The SDFGenerator reference is sourced from the `ShadowPipeline` singleton
 * trait — the authoritative owner of that handle. No mirrored state.
 */
export function lightEffectSystem(world: World): void {
  const ctxEntities = world.view(LightingContexts)
  if (ctxEntities.length === 0) return

  const ctx = world.read(ctxEntities[0]!, LightingContext)
  if (!ctx) return
  if (!ctx.effect?.enabled || !ctx.lightStore) return
  if (!ctx.renderer || !ctx.camera) return
  if (!ctx.scene) return

  // Pull the live SDF handle from ShadowPipeline. Null when the active
  // effect does not declare needsShadows, which is correct — effects that
  // don't need shadows shouldn't see a generator in their runtime context.
  const pipelineEntities = world.view(ShadowPipelines)
  const pipeline = pipelineEntities.length > 0 ? world.read(pipelineEntities[0]!, ShadowPipeline) : null
  const sdfGenerator = pipeline?.sdfGenerator ?? null
  const occlusionTexture = pipeline?.occlusionPass?.renderTarget.texture ?? null

  const cam = ctx.camera
  const worldSize = ctx.worldSize
  const worldOffset = ctx.worldOffset

  worldSize.set(cam.right - cam.left, cam.top - cam.bottom)
  worldOffset.set(cam.position.x + cam.left, cam.position.y + cam.bottom)

  // Mutate this world's scratch in place — no per-frame allocation.
  const runtimeCtx = runtimeContextFor(world)
  runtimeCtx.renderer = ctx.renderer
  runtimeCtx.camera = cam
  runtimeCtx.scene = ctx.scene
  runtimeCtx.lightStore = ctx.lightStore
  runtimeCtx.sdfGenerator = sdfGenerator
  runtimeCtx.occlusionTexture = occlusionTexture
  runtimeCtx.lights = ctx.lights
  runtimeCtx.worldSize = worldSize
  runtimeCtx.worldOffset = worldOffset

  // Lazy init on first render
  if (!ctx.initialized) {
    ctx.effect.init(runtimeCtx)
    ctx.effect._initialized = true
    ctx.initialized = true
    ctx.resizePending = true
  }

  // Resize only after init. The pending bit also covers effects attached
  // after the surface was measured and effects re-enabled after a resize.
  if (ctx.resizePending && ctx.surfaceSize.x > 0 && ctx.surfaceSize.y > 0) {
    ctx.effect.resize(ctx.surfaceSize.x, ctx.surfaceSize.y)
    ctx.resizePending = false
  }

  // Per-frame update (tiling, SDF shadows, radiance cascades, etc.)
  ctx.effect.update(runtimeCtx)
}
