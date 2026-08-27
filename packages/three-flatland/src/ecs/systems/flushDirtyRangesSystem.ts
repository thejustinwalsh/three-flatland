import { select, type World } from '../runtime'
import { BatchRegistry, BatchMesh } from '../traits'
import type { RegistryData } from '../batchUtils'

const BatchRegistries = select(BatchRegistry)

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
  const registryEntities = world.view(BatchRegistries)
  if (registryEntities.length === 0) return
  const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
  if (!registry) return

  // Reset the occluder-dirty flag, then capture per-batch dirtiness BEFORE
  // flushing (flush clears the trackers). shadowPipelineSystem reads this to
  // decide whether the occluder render + SDF regen can be skipped.
  registry.occludersDirty = false

  for (const batchEntity of registry.activeBatches) {
    const batchMesh = world.read(batchEntity, BatchMesh)
    if (batchMesh?.mesh) {
      if (batchMesh.mesh.isDirty) registry.occludersDirty = true
      batchMesh.mesh.flushDirtyRanges()
    }
  }
}
