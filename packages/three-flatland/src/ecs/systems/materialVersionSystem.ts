import type { World } from 'koota'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { evictBatchesForMaterial } from '../batchUtils'

/**
 * Check for material schema version changes (tier upgrades from effect registration).
 *
 * When detected, evicts sprites from old batches (wrong buffer layout) and
 * re-triggers IsRenderable so batchAssignSystem creates new batches with
 * the correct effect buffer tier.
 *
 * Self-gating: no-ops if no BatchRegistry exists.
 */
export function materialVersionSystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const [materialId, ref] of registry.materialRefs) {
    if (ref.material._effectSchemaVersion !== ref.version) {
      ref.version = ref.material._effectSchemaVersion
      evictBatchesForMaterial(world, registry, materialId)
    }
  }
}
