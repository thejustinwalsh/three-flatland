import { select, type World } from '../runtime'
import { LightingContext } from '../traits'
import type { ChannelName } from '../../materials/channels'

const LightingContexts = select(LightingContext)

/**
 * Push wrappedLightFn + requiredChannels to all tracked sprite materials.
 *
 * Self-gating: no-ops if LightingContext doesn't exist or dirty flag is false.
 * Clears the dirty flag after processing.
 */
export function lightMaterialAssignSystem(world: World): void {
  const ctxEntities = world.view(LightingContexts)
  if (ctxEntities.length === 0) return

  const ctx = world.read(ctxEntities[0]!, LightingContext)
  if (!ctx || !ctx.dirty) return

  ctx.dirty = false

  const fn = ctx.wrappedLightFn
  const channels = fn ? ctx.requiredChannels : new Set<ChannelName>()

  for (const mat of ctx.materials) {
    mat.requiredChannels = channels
    mat.colorTransform = fn
  }
}
