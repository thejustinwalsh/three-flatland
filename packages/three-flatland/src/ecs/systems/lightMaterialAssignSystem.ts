import type { World } from 'koota'
import { LightingContext } from '../traits'
import type { ChannelName } from '../../materials/channels'

/**
 * Push wrappedLightFn + requiredChannels to all tracked sprite materials.
 *
 * Self-gating: no-ops if LightingContext doesn't exist or dirty flag is false.
 * Clears the dirty flag after processing.
 */
export function lightMaterialAssignSystem(world: World): void {
  const ctxEntities = world.query(LightingContext)
  if (ctxEntities.length === 0) return

  const ctx = ctxEntities[0]!.get(LightingContext)
  if (!ctx || !ctx.dirty) return

  ctx.dirty = false

  const fn = ctx.wrappedLightFn
  const channels = fn ? ctx.requiredChannels : new Set<ChannelName>()

  for (const mat of ctx.materials) {
    mat.requiredChannels = channels
    mat.colorTransform = fn
  }
}
