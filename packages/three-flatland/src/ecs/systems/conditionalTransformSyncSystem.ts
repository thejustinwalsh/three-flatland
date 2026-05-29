import type { World } from 'koota'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { transformSyncSystem } from './transformSyncSystem'

/**
 * Conditionally run transformSyncSystem based on autoInvalidateTransforms flag.
 *
 * When autoInvalidateTransforms is true (default), runs every frame.
 * When false, the system is a no-op — users must call invalidateTransforms() manually.
 *
 * Self-gating: no-ops if no BatchRegistry exists or flag is false.
 */
export function conditionalTransformSyncSystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry || !registry.autoInvalidateTransforms) return

  transformSyncSystem(world)
}
