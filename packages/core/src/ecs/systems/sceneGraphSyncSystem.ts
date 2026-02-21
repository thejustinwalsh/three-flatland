import type { Group, Object3D } from 'three'
import type { World } from 'koota'
import { BatchRegistry, BatchMesh } from '../traits'
import type { RegistryData } from '../batchUtils'
import { rebuildBatchOrder } from '../batchUtils'

/**
 * Sync batch entities with the Three.js scene graph.
 *
 * Rebuilds the Renderer2D's children from the sorted batch entity list.
 * Only runs when renderOrderDirty is set (batches added/removed).
 *
 * @param world - ECS world to query BatchRegistry
 * @param parent - The Renderer2D Group to sync children on
 * @param parentAdd - Bound Group.prototype.add from the parent (bypasses Renderer2D override)
 * @param parentRemove - Bound Group.prototype.remove from the parent (bypasses Renderer2D override)
 */
export function sceneGraphSyncSystem(
  world: World,
  parent: Group,
  parentAdd: (...objects: Object3D[]) => Group,
  parentRemove: (...objects: Object3D[]) => Group
): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  // Rebuild sorted order if needed
  rebuildBatchOrder(registry)

  // Build set of active batch meshes
  const activeMeshes = new Set<Object3D>()
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
