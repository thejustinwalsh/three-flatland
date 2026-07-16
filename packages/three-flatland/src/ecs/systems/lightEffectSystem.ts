import type { World } from 'koota'
import { LightingContext, ShadowPipeline } from '../traits'
import type { LightEffectRuntimeContext } from '../../lights/LightEffect'

// Module-scoped scratch reused every frame. It is initialized from the first
// complete lighting context, then mutated in place so the hot path stays
// zero-allocation without placeholder values or type assertions.
let _runtimeCtx: LightEffectRuntimeContext | null = null

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
  // `left` / `bottom` are local frustum extents; Forward+ compares this
  // offset with absolute sprite/light positions. Include camera motion so
  // lights stay inside the culling grid as the world scrolls.
  worldOffset.set(cam.position.x + cam.left, cam.position.y + cam.bottom)

  const runtimeCtx = (_runtimeCtx ??= {
    renderer: ctx.renderer,
    camera: cam,
    lightStore: ctx.lightStore,
    sdfGenerator,
    lights: ctx.lights,
    worldSize,
    worldOffset,
  })
  runtimeCtx.renderer = ctx.renderer
  runtimeCtx.camera = cam
  runtimeCtx.lightStore = ctx.lightStore
  runtimeCtx.sdfGenerator = sdfGenerator
  runtimeCtx.lights = ctx.lights
  runtimeCtx.worldSize = worldSize
  runtimeCtx.worldOffset = worldOffset

  // Lazy init on first render
  if (!ctx.initialized) {
    ctx.effect.init(runtimeCtx)
    ctx.initialized = true
  }

  // Per-frame update (tiling, SDF shadows, radiance cascades, etc.)
  ctx.effect.update(runtimeCtx)
}
