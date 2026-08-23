import { select, type World } from '../runtime'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { evictBatchesForMaterial } from '../batchUtils'

const BatchRegistries = select(BatchRegistry)

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
  const registryEntities = world.view(BatchRegistries)
  if (registryEntities.length === 0) return
  const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const [materialId, ref] of registry.materialRefs) {
    if (ref.material._effectSchemaVersion !== ref.version) {
      ref.version = ref.material._effectSchemaVersion
      evictBatchesForMaterial(world, registry, materialId)
    }
  }
}
