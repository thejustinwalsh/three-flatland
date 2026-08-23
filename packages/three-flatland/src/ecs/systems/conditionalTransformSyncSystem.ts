import { select, type World } from '../runtime'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { transformSyncSystem } from './transformSyncSystem'

const BatchRegistries = select(BatchRegistry)

/**
 * Conditionally run transformSyncSystem based on autoInvalidateTransforms flag.
 *
 * When autoInvalidateTransforms is true (default), runs every frame.
 * When false, the system runs only for explicit or lifecycle invalidation.
 *
 * Self-gating: no-ops if no BatchRegistry exists or neither condition is active.
 */
export function conditionalTransformSyncSystem(world: World): void {
  const registryEntities = world.view(BatchRegistries)
  if (registryEntities.length === 0) return
  const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
  if (!registry || (!registry.autoInvalidateTransforms && !registry.transformsDirty)) return

  transformSyncSystem(world)
  registry.transformsDirty = false
}
