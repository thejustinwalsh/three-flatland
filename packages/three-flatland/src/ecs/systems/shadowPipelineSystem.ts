import { Vector2, NearestFilter, LinearFilter } from 'three'
import type { World } from 'koota'
import { BatchRegistry, LightingContext, ShadowPipeline } from '../traits'
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
 * so consumer systems (future shadow-sampling shaders, GI effects, etc.)
 * pick it up via the existing trait field.
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

  // Tracks whether init/resize forces a regen this run regardless of the
  // occluder/camera dirty signals (the SDF RT contents are stale/unsized).
  let mustRegen = false

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
    mustRegen = true
  } else if (sdfW !== pipeline.width || sdfH !== pipeline.height) {
    pipeline.sdfGenerator.resize(sdfW, sdfH)
    pipeline.occlusionPass.resize(_sizeScratch.x, _sizeScratch.y)
    pipeline.width = sdfW
    pipeline.height = sdfH
    mustRegen = true
  }

  // Resolve + apply the SDF-output sampling filter every frame (before the
  // dirty gate's early-return, so a filter change lands even on an
  // otherwise-static frame). Read defensively: the active effect is a
  // generic LightEffect, but these constants are DefaultLightEffect-specific.
  const c = (effect as { constants?: Record<string, unknown> }).constants
  const mode = (c?.shadowFilter as string) ?? 'auto'
  const snap = (c?.shadowPixelSnapEnabled as boolean) ?? false
  const desired =
    mode === 'nearest' ? NearestFilter : mode === 'linear' ? LinearFilter : snap ? NearestFilter : LinearFilter
  pipeline.sdfGenerator.setFilter(desired)

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
  let left = NaN
  let right = NaN
  let top = NaN
  let bottom = NaN
  if (
    typeof ortho.left === 'number' &&
    typeof ortho.right === 'number' &&
    typeof ortho.top === 'number' &&
    typeof ortho.bottom === 'number'
  ) {
    left = ortho.left
    right = ortho.right
    top = ortho.top
    bottom = ortho.bottom
    _worldSizeScratch.set(right - left, top - bottom)
    pipeline.sdfGenerator.setWorldBounds(_worldSizeScratch)
  }

  // Occluder-dirty gate. Skip the occluder render + SDF regen when no
  // occluder changed since the last generation and the camera frustum/
  // position is unchanged — the SDF render-target retains the previous
  // generation, which is correct when nothing moved. The size-sync / init /
  // resize / setWorldBounds logic above still runs every frame; only the two
  // GPU passes below are gated.
  const registryEntities = world.query(BatchRegistry)
  // Treat a missing registry as dirty so shadows never silently freeze.
  const occludersDirty =
    registryEntities.length === 0 ? true : (registryEntities[0]!.get(BatchRegistry)?.occludersDirty ?? true)

  const posX = camera.position.x
  const posY = camera.position.y
  // OrthographicCamera.zoom scales the projection without touching the raw
  // frustum bounds, so a zoom change moves/scales the occluder silhouettes
  // the pass renders. Include it or the gate would skip regen and freeze
  // shadows at the pre-zoom state.
  const zoom = (camera as { zoom?: number }).zoom ?? 1
  const cameraChanged =
    !Object.is(left, pipeline.lastLeft) ||
    !Object.is(right, pipeline.lastRight) ||
    !Object.is(top, pipeline.lastTop) ||
    !Object.is(bottom, pipeline.lastBottom) ||
    !Object.is(posX, pipeline.lastPosX) ||
    !Object.is(posY, pipeline.lastPosY) ||
    !Object.is(zoom, pipeline.lastZoom)

  const dirty = mustRegen || occludersDirty || cameraChanged
  if (!dirty) return

  pipeline.occlusionPass.render(renderer, scene, camera)
  pipeline.sdfGenerator.generate(renderer, pipeline.occlusionPass.renderTarget)

  // Record the frustum/position this generation was rendered against so the
  // next frame can detect a camera change.
  pipeline.lastLeft = left
  pipeline.lastRight = right
  pipeline.lastTop = top
  pipeline.lastBottom = bottom
  pipeline.lastPosX = posX
  pipeline.lastPosY = posY
  pipeline.lastZoom = zoom
}
