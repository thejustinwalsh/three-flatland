import { Vector2 } from 'three'
import type { World } from 'koota'
import { LightingContext, ShadowPipeline } from '../traits'
import { SDFGenerator } from '../../lights/SDFGenerator'
import { OcclusionPass } from '../../lights/OcclusionPass'
import type { LightEffect } from '../../lights/LightEffect'

/**
 * Owns the shared shadow pipeline end-to-end.
 *
 * Reads the active effect from `LightingContext`; if its class declares
 * `needsShadows`, allocates the JFA SDF generator + occluder pre-pass,
 * sizes them to the renderer, runs the pre-pass each frame, and writes
 * the resulting SDFGenerator handle back to `LightingContext.sdfGenerator`
 * so consumer systems (`RadianceLightEffect.update`, future shadow-sampling
 * shaders) pick it up via the existing trait field.
 *
 * Lifecycle is idempotent and self-gating:
 * - No LightingContext → no-op.
 * - Effect disabled / no renderer yet → no-op.
 * - Effect doesn't need shadows → teardown any existing pipeline, then no-op.
 * - Effect needs shadows → allocate + init on first run, resize on size
 *   change, render pre-pass on every run.
 *
 * Performance notes:
 * - Single `world.query(LightingContext)` + `world.query(ShadowPipeline)`
 *   per frame. Koota caches query results by trait signature, so these
 *   are O(1) lookups after warmup.
 * - `entity.get(Trait)` for factory-function traits returns the stored
 *   object reference — no allocation, no cloning. Mutations happen in
 *   place (`pipeline.initialized = true`), bypassing `entity.set`'s
 *   `Changed()` wakeup since nothing queries this trait with Changed().
 * - A scratch `Vector2` is allocated once at module load for size
 *   reads, reused every frame.
 * - The fast path when shadows are active and size hasn't changed is
 *   two branch predictions, then the two render calls — no CPU work
 *   in JS beyond that.
 */
const _sizeScratch = new Vector2()
const _worldSizeScratch = new Vector2()

export function shadowPipelineSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return
  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx) return

  const pipelineEntities = world.query(ShadowPipeline)
  if (pipelineEntities.length === 0) return
  const pipeline = pipelineEntities[0]!.get(ShadowPipeline)
  if (!pipeline) return

  const effect = ctx.effect
  const renderer = ctx.renderer

  // Determine whether the active effect wants the shadow pipeline alive.
  let needsShadows = false
  if (effect && effect.enabled) {
    const ctor = effect.constructor as typeof LightEffect
    needsShadows = ctor.needsShadows === true
  }

  // Teardown path: active effect doesn't need shadows but we hold state.
  if (!needsShadows) {
    if (pipeline.sdfGenerator) {
      pipeline.sdfGenerator.dispose()
      pipeline.sdfGenerator = null
    }
    if (pipeline.occlusionPass) {
      pipeline.occlusionPass.dispose()
      pipeline.occlusionPass = null
    }
    pipeline.initialized = false
    pipeline.width = 0
    pipeline.height = 0
    return
  }

  // From here on the effect wants shadows. Bail while essential runtime
  // context is missing — the effect's update() will be skipped by
  // lightEffectSystem under the same conditions, so no visible work
  // is being dropped.
  if (!renderer) return
  const camera = ctx.camera
  if (!camera) return

  // Lazy allocate on first entry. Construction here is cheap (no GPU
  // resources until init() below). Consumers (lightEffectSystem builds
  // the effect runtime context) pull the handle straight from this trait
  // each frame — no mirrored state on LightingContext.
  if (!pipeline.sdfGenerator) {
    pipeline.sdfGenerator = new SDFGenerator()
  }
  if (!pipeline.occlusionPass) {
    pipeline.occlusionPass = new OcclusionPass()
  }

  // Size sync. `renderer.getSize(scratch)` avoids allocation; we only
  // call init()/resize() on dimension change so the hot path is a
  // compare-and-return.
  renderer.getSize(_sizeScratch)
  const scale = pipeline.occlusionPass.resolutionScale
  const sdfW = Math.max(1, Math.floor(_sizeScratch.x * scale))
  const sdfH = Math.max(1, Math.floor(_sizeScratch.y * scale))

  if (!pipeline.initialized) {
    pipeline.sdfGenerator.init(sdfW, sdfH)
    pipeline.occlusionPass.resize(_sizeScratch.x, _sizeScratch.y)
    pipeline.width = sdfW
    pipeline.height = sdfH
    pipeline.initialized = true
  } else if (sdfW !== pipeline.width || sdfH !== pipeline.height) {
    pipeline.sdfGenerator.resize(sdfW, sdfH)
    pipeline.occlusionPass.resize(_sizeScratch.x, _sizeScratch.y)
    pipeline.width = sdfW
    pipeline.height = sdfH
  }

  const scene = ctx.scene
  if (!scene) return

  // Push current world bounds into the SDF generator so the JFA seed
  // comparison and final distance encode world-space values. Read them
  // directly off the camera — `ctx.worldSize` is only populated later
  // in the frame by lightEffectSystem, so using it here would lag a frame
  // (and be (0,0) on the first frame, collapsing the JFA metric). An
  // ortho camera is required by the shadow pipeline; cast guards against
  // callers that plug in a perspective camera by mistake.
  const ortho = camera as { left?: number; right?: number; top?: number; bottom?: number }
  if (typeof ortho.left === 'number' && typeof ortho.right === 'number' &&
      typeof ortho.top === 'number' && typeof ortho.bottom === 'number') {
    _worldSizeScratch.set(ortho.right - ortho.left, ortho.top - ortho.bottom)
    pipeline.sdfGenerator.setWorldBounds(_worldSizeScratch)
  }

  pipeline.occlusionPass.render(renderer, scene, camera)
  pipeline.sdfGenerator.generate(renderer, pipeline.occlusionPass.renderTarget)
}
