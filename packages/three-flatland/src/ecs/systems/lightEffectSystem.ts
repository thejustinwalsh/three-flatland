import { Vector2 } from 'three'
import type { World } from 'koota'
import { LightingContext } from '../traits'
import type { LightEffectRuntimeContext } from '../../lights/LightEffect'

/**
 * Run LightEffect lifecycle: lazy init + per-frame update.
 *
 * Self-gating: no-ops if LightingContext doesn't exist, effect is disabled,
 * or runtime context (renderer/camera) is not yet available.
 */
export function lightEffectSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return

  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx) return
  if (!ctx.effect?.enabled || !ctx.lightStore) return
  if (!ctx.renderer || !ctx.camera) return

  const cam = ctx.camera
  const worldSize = ctx.worldSize ?? new Vector2()
  const worldOffset = ctx.worldOffset ?? new Vector2()

  worldSize.set(cam.right - cam.left, cam.top - cam.bottom)
  worldOffset.set(cam.left, cam.bottom)

  const runtimeCtx: LightEffectRuntimeContext = {
    renderer: ctx.renderer,
    camera: cam,
    lightStore: ctx.lightStore,
    sdfGenerator: ctx.sdfGenerator,
    lights: ctx.lights,
    worldSize,
    worldOffset,
  }

  // Lazy init on first render
  if (!ctx.initialized) {
    ctx.effect.init(runtimeCtx)
    ctx.initialized = true
  }

  // Per-frame update (tiling, SDF shadows, radiance cascades, etc.)
  ctx.effect.update(runtimeCtx)
}
