import { select, type World } from '../runtime'
import { LightingContext } from '../traits'

const LightingContexts = select(LightingContext)

/**
 * Sync Light2D array into LightStore DataTexture.
 *
 * Self-gating: no-ops if LightingContext doesn't exist or effect is disabled.
 * Called once per frame before lightEffectSystem.
 */
export function lightSyncSystem(world: World): void {
  const ctxEntities = world.view(LightingContexts)
  if (ctxEntities.length === 0) return

  const ctx = world.read(ctxEntities[0]!, LightingContext)
  if (!ctx) return
  if (!ctx.effect?.enabled || !ctx.lightStore) return

  ctx.lightStore.sync(ctx.lights)
}
