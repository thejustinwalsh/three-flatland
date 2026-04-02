import type { World } from 'koota'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { batchAssignSystem } from './batchAssignSystem'
import { transformSyncSystem } from './transformSyncSystem'
import { sceneGraphSyncSystem } from './sceneGraphSyncSystem'

/**
 * Late assignment pass: catches entities enrolled after the primary
 * batchAssignSystem pass (e.g., enrolled between render calls in
 * R3F reconciliation). A no-op in the common case.
 *
 * When new entities are found, runs transform sync and scene graph
 * sync for them. Reads autoInvalidateTransforms from BatchRegistry.
 */
export function lateAssignSystem(world: World): void {
  const lateAssigned = batchAssignSystem(world)
  if (!lateAssigned) return

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  if (registry.autoInvalidateTransforms) {
    transformSyncSystem(world)
  }
  sceneGraphSyncSystem(world)
}
