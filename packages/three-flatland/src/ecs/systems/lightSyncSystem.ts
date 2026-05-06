import type { World } from 'koota'
import { LightingContext } from '../traits'

/**
 * Sync Light2D array into LightStore DataTexture.
 *
 * Self-gating: no-ops if LightingContext doesn't exist or effect is disabled.
 * Called once per frame before lightEffectSystem.
 */
export function lightSyncSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return

  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx) return
  if (!ctx.effect?.enabled || !ctx.lightStore) return

  ctx.lightStore.sync(ctx.lights)
}
