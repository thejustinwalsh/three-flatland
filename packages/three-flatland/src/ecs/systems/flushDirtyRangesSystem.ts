import type { World } from 'koota'
import { BatchRegistry, BatchMesh } from '../traits'
import type { RegistryData } from '../batchUtils'

/**
 * Flush dirty ranges for all active batch meshes.
 *
 * Single consolidated GPU upload per attribute. All write methods track
 * min/max slot indices; this converts them to addUpdateRange calls so
 * only the changed portion is uploaded.
 *
 * Self-gating: no-ops if no BatchRegistry exists.
 */
export function flushDirtyRangesSystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const batchEntity of registry.activeBatches) {
    const batchMesh = batchEntity.get(BatchMesh)
    if (batchMesh?.mesh) {
      batchMesh.mesh.flushDirtyRanges()
    }
  }
}
