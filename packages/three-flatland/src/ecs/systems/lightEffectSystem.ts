import type { World } from 'koota'
import { LightingContext, ShadowPipeline } from '../traits'
import type { LightEffectRuntimeContext } from '../../lights/LightEffect'

// Module-scoped scratch reused every frame — mutated in place so the
// per-frame update path stays zero-alloc past warmup (matches the perf
// conventions in transformSyncSystem / OcclusionPass). Field shape mirrors
// LightEffectRuntimeContext exactly; every field is reassigned below before
// the context is handed to the effect, so the null/[] seeds never leak.
const _runtimeCtx = {
  renderer: null,
  camera: null,
  lightStore: null,
  sdfGenerator: null,
  lights: [],
  worldSize: null,
  worldOffset: null,
} as unknown as LightEffectRuntimeContext

/**
 * Run LightEffect lifecycle: lazy init + per-frame update.
 *
 * Self-gating: no-ops if LightingContext doesn't exist, effect is disabled,
 * or runtime context (renderer/camera) is not yet available.
 *
 * The SDFGenerator reference is sourced from the `ShadowPipeline` singleton
 * trait — the authoritative owner of that handle. No mirrored state.
 */
export function lightEffectSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return

  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx) return
  if (!ctx.effect?.enabled || !ctx.lightStore) return
  if (!ctx.renderer || !ctx.camera) return

  // Pull the live SDF handle from ShadowPipeline. Null when the active
  // effect does not declare needsShadows, which is correct — effects that
  // don't need shadows shouldn't see a generator in their runtime context.
  const pipelineEntities = world.query(ShadowPipeline)
  const pipeline = pipelineEntities.length > 0 ? pipelineEntities[0]!.get(ShadowPipeline) : null
  const sdfGenerator = pipeline?.sdfGenerator ?? null

  const cam = ctx.camera
  const worldSize = ctx.worldSize
  const worldOffset = ctx.worldOffset

  worldSize.set(cam.right - cam.left, cam.top - cam.bottom)
  worldOffset.set(cam.left, cam.bottom)

  // Mutate the module-scoped scratch in place — no per-frame allocation.
  _runtimeCtx.renderer = ctx.renderer
  _runtimeCtx.camera = cam
  _runtimeCtx.lightStore = ctx.lightStore
  _runtimeCtx.sdfGenerator = sdfGenerator
  _runtimeCtx.lights = ctx.lights
  _runtimeCtx.worldSize = worldSize
  _runtimeCtx.worldOffset = worldOffset

  // Lazy init on first render
  if (!ctx.initialized) {
    ctx.effect.init(_runtimeCtx)
    ctx.initialized = true
  }

  // Per-frame update (tiling, SDF shadows, radiance cascades, etc.)
  ctx.effect.update(_runtimeCtx)
}
