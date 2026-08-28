import { Vector2, NearestFilter, LinearFilter } from 'three'
import { select, type World } from '../runtime'
import { BatchRegistry, LightingContext, ShadowPipeline } from '../traits'
import { SDFGenerator } from '../../lights/SDFGenerator'
import { OcclusionPass } from '../../lights/OcclusionPass'

const LightingContexts = select(LightingContext)
const ShadowPipelines = select(ShadowPipeline)
const BatchRegistries = select(BatchRegistry)

/**
 * Owns the shared shadow pipeline end-to-end.
 *
 * Reads the active effect from `LightingContext`; if it requests shadow data,
 * allocates the occluder pre-pass and optionally the JFA SDF generator,
 * sizes them to Flatland's canonical render surface, runs the pre-pass each frame, and writes
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
 * - Stable selector views for `LightingContext` and `ShadowPipeline` are
 *   reused every frame, so retrieval is O(1) after warmup.
 * - `world.read(entity, Trait)` for object traits returns the stored
 *   object reference — no allocation, no cloning. Mutations happen in
 *   place (`pipeline.initialized = true`), bypassing `entity.set`'s
 *   tracked-change wakeup since nothing subscribes to this trait's changes.
 * - The fast path when shadows are active and size hasn't changed is
 *   two branch predictions, then the two render calls — no CPU work
 *   in JS beyond that.
 */
const _worldSizeScratch = new Vector2()
const _captureWorldSizeScratch = new Vector2()
const _captureWorldOffsetScratch = new Vector2()

export function shadowPipelineSystem(world: World): void {
  const ctxEntities = world.view(LightingContexts)
  if (ctxEntities.length === 0) return
  const ctx = world.read(ctxEntities[0]!, LightingContext)
  if (!ctx) return

  // Flatland depublishes both handles while an old effect's extensible
  // dispose() callback is running. Treat that transactional state like a
  // missing context so a direct system call cannot retire or replace the
  // still-authoritative shadow generation.
  if (!ctx.effect && !ctx.lightStore) return

  const pipelineEntities = world.view(ShadowPipelines)
  if (pipelineEntities.length === 0) return
  const pipeline = world.read(pipelineEntities[0]!, ShadowPipeline)
  if (!pipeline) return

  const effect = ctx.effect
  const renderer = ctx.renderer

  // Determine the finest shadow representation the active effect wants alive.
  // DDA traversal consumes the binary occlusion target directly and must not
  // pay the JFA generation cost required by distance-field consumers.
  let needsShadows = false
  let needsSdf = false
  if (effect && effect.enabled) {
    const shadowMode = effect.shadowPipelineMode
    needsShadows = shadowMode !== 'none'
    needsSdf = shadowMode === 'sdf'
  }

  // Teardown path: active effect doesn't need shadows but we hold state.
  if (!needsShadows) {
    const sdfGenerator = pipeline.sdfGenerator
    const occlusionPass = pipeline.occlusionPass
    const onResourcesChanged = pipeline.onResourcesChanged
    pipeline.sdfGenerator = null
    pipeline.occlusionPass = null
    let firstError: unknown
    let didError = false
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    if ((sdfGenerator || occlusionPass) && onResourcesChanged) {
      runCleanup(() => onResourcesChanged(null, null))
    }
    if (sdfGenerator) runCleanup(() => sdfGenerator.dispose())
    if (occlusionPass) runCleanup(() => occlusionPass.dispose())
    pipeline.initialized = false
    pipeline.width = 0
    pipeline.height = 0
    if (didError) throw firstError
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

  // Runtime DDA/SDF switching retains the binary occlusion pass while adding
  // or retiring the distance field independently.
  let sdfCreated = false
  if (needsSdf && !pipeline.sdfGenerator) {
    pipeline.sdfGenerator = new SDFGenerator()
    sdfCreated = true
    pipeline.onResourcesChanged?.(pipeline.sdfGenerator, pipeline.occlusionPass)
  }
  if (!needsSdf && pipeline.sdfGenerator) {
    const retiredSdf = pipeline.sdfGenerator
    pipeline.sdfGenerator = null
    pipeline.onResourcesChanged?.(null, pipeline.occlusionPass)
    retiredSdf.dispose()
  }
  if (!pipeline.occlusionPass) {
    pipeline.occlusionPass = new OcclusionPass()
    pipeline.onResourcesChanged?.(pipeline.sdfGenerator, pipeline.occlusionPass)
  }

  // Size from the active LightEffect processing surface (the physical render
  // surface multiplied by effect.resolutionScale). Using the trait keeps shadow
  // buffers in the same coordinate space as the effect-owned resources.
  const surfaceWidth = ctx.surfaceSize.x
  const surfaceHeight = ctx.surfaceSize.y
  if (surfaceWidth <= 0 || surfaceHeight <= 0) return
  const captureMargin = effect?.shadowCaptureMargin ?? 0
  const viewWorldWidth = camera.right - camera.left
  const viewWorldHeight = camera.top - camera.bottom
  _captureWorldSizeScratch.set(viewWorldWidth + captureMargin * 2, viewWorldHeight + captureMargin * 2)
  _captureWorldOffsetScratch.set(
    camera.position.x + camera.left - captureMargin,
    camera.position.y + camera.bottom - captureMargin
  )
  // Preserve the visible capture density. Only the source/occlusion target
  // grows; the effect-owned cascade probe/output grid remains viewport-sized.
  const captureSurfaceWidth = Math.max(
    1,
    Math.ceil(surfaceWidth * (_captureWorldSizeScratch.x / Math.max(1e-6, viewWorldWidth)))
  )
  const captureSurfaceHeight = Math.max(
    1,
    Math.ceil(surfaceHeight * (_captureWorldSizeScratch.y / Math.max(1e-6, viewWorldHeight)))
  )
  const scale = pipeline.occlusionPass.resolutionScale
  const sdfW = Math.max(1, Math.floor(captureSurfaceWidth * scale))
  const sdfH = Math.max(1, Math.floor(captureSurfaceHeight * scale))

  // OcclusionPass applies this same scale internally and stores only the
  // resulting physical RT dimensions. If an unscaled surface change rounds
  // to the same sdfW/sdfH (for example 512 → 513 at 0.5), neither shadow
  // resource changes size and a resize/regeneration would be redundant.
  if (!pipeline.initialized) {
    pipeline.sdfGenerator?.init(sdfW, sdfH)
    pipeline.occlusionPass.resize(captureSurfaceWidth, captureSurfaceHeight)
    pipeline.width = sdfW
    pipeline.height = sdfH
    pipeline.initialized = true
    mustRegen = true
  } else if (sdfW !== pipeline.width || sdfH !== pipeline.height) {
    pipeline.sdfGenerator?.resize(sdfW, sdfH)
    pipeline.occlusionPass.resize(captureSurfaceWidth, captureSurfaceHeight)
    pipeline.width = sdfW
    pipeline.height = sdfH
    mustRegen = true
  } else if (sdfCreated) {
    pipeline.sdfGenerator?.init(sdfW, sdfH)
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
  pipeline.sdfGenerator?.setFilter(desired)

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
    _worldSizeScratch.copy(_captureWorldSizeScratch)
    pipeline.sdfGenerator?.setWorldBounds(_worldSizeScratch)
  }

  // Occluder-dirty gate. Skip the occluder render + SDF regen when no
  // occluder changed since the last generation and the camera frustum/
  // position is unchanged — the SDF render-target retains the previous
  // generation, which is correct when nothing moved. The size-sync / init /
  // resize / setWorldBounds logic above still runs every frame; only the two
  // GPU passes below are gated.
  const registryEntities = world.view(BatchRegistries)
  // Treat a missing registry as dirty so shadows never silently freeze.
  const occludersDirty =
    registryEntities.length === 0 ? true : (world.read(registryEntities[0]!, BatchRegistry)?.occludersDirty ?? true)

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

  pipeline.occlusionPass.render(renderer, scene, camera, _captureWorldSizeScratch, _captureWorldOffsetScratch)
  pipeline.sdfGenerator?.generate(renderer, pipeline.occlusionPass.renderTarget)

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
