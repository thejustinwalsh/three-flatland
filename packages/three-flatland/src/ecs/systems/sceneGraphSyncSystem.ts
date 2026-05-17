import type { Group, Object3D } from 'three'
import type { World } from 'koota'
import { BatchRegistry, BatchMesh } from '../traits'
import type { RegistryData } from '../batchUtils'
import { rebuildBatchOrder } from '../batchUtils'

/**
 * Create a scene-graph sync system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function rebuilds the
 * Group's children from the sorted batch-entity list. Only runs when
 * renderOrderDirty is set (batches added/removed).
 *
 * Closes over the active-meshes Set so it's cleared-and-filled per call
 * instead of allocated. Each group has its own Set.
 *
 * @returns a system function: (world, parent, parentAdd, parentRemove) => void
 */
export function createSceneGraphSyncSystem(): (
  world: World,
  parent: Group,
  parentAdd: (...objects: Object3D[]) => Group,
  parentRemove: (...objects: Object3D[]) => Group,
) => void {
  const activeMeshes = new Set<Object3D>()

  return function sceneGraphSyncSystem(
    world: World,
    parent: Group,
    parentAdd: (...objects: Object3D[]) => Group,
    parentRemove: (...objects: Object3D[]) => Group,
  ): void {
    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    // Rebuild sorted order if needed
    rebuildBatchOrder(registry)

    // Build set of active batch meshes — clear-and-fill instead of new.
    activeMeshes.clear()
    for (const batchEntity of registry.activeBatches) {
      const batchMesh = batchEntity.get(BatchMesh)
      if (batchMesh?.mesh) activeMeshes.add(batchMesh.mesh)
    }

    // Remove children not in active batches
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const child = parent.children[i]
      if (child && !activeMeshes.has(child)) {
        parentRemove.call(parent, child)
      }
    }

    // Add new batches and set renderOrder
    for (let i = 0; i < registry.activeBatches.length; i++) {
      const batchEntity = registry.activeBatches[i]!
      const batchMesh = batchEntity.get(BatchMesh)
      if (!batchMesh?.mesh) continue

      batchMesh.mesh.renderOrder = i
      if (!parent.children.includes(batchMesh.mesh)) {
        parentAdd.call(parent, batchMesh.mesh)
      }
    }
  }
}
