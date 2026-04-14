import type { World } from 'koota'
import {
  BatchRegistry,
  IsBatched,
  SpriteMaterialRef,
  BatchSlot,
  InBatch,
  BatchMesh,
  BatchMeta,
  IsRenderable,
} from '../traits'
import type { RegistryData } from '../batchUtils'
import { computeRunKey, recycleBatchIfEmpty } from '../batchUtils'

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
      rebuildBatchesForMaterial(world, registry, materialId)
    }
  }
}

/**
 * Force-rebuild batches for a material by evicting sprite entities from
 * old batches and re-triggering IsRenderable for batchAssignSystem.
 */
function rebuildBatchesForMaterial(world: World, registry: RegistryData, materialId: number): void {
  const batched = world.query(IsBatched, SpriteMaterialRef, BatchSlot)
  for (const entity of batched) {
    const matRef = entity.get(SpriteMaterialRef)
    if (!matRef || matRef.materialId !== materialId) continue

    const batchEntity = entity.targetFor(InBatch)
    if (batchEntity) {
      const relationData = entity.get(InBatch(batchEntity)) as { slot: number } | undefined
      const batchMesh = batchEntity.get(BatchMesh)
      if (relationData && batchMesh?.mesh) {
        batchMesh.mesh.freeSlot(relationData.slot)
        batchMesh.mesh.syncCount()
      }

      entity.remove(InBatch(batchEntity))

      if (batchMesh?.mesh?.isEmpty) {
        const meta = batchEntity.get(BatchMeta)
        if (meta) {
          const key = computeRunKey(meta.layer, meta.materialId)
          const run = registry.runs.get(key)
          if (run) {
            recycleBatchIfEmpty(registry, batchEntity, run)
          }
        }
      }
    }

    entity.set(BatchSlot, { batchIdx: -1, slot: -1 }, false)
    entity.remove(IsRenderable)
    entity.add(IsRenderable)
  }

  registry.renderOrderDirty = true
}
