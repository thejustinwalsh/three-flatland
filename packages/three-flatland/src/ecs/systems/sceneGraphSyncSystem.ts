import type { Group, Object3D } from 'three'
import type { World } from 'koota'
import { BatchRegistry, BatchMesh, BatchMeta } from '../traits'
import type { RegistryData } from '../batchUtils'
import { rebuildBatchOrder } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'

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
  parentRemove: (...objects: Object3D[]) => Group
) => void {
  const activeMeshes = new Set<Object3D>()

  return function sceneGraphSyncSystem(
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

    // Build set of active batch meshes — clear-and-fill instead of new.
    activeMeshes.clear()
    for (const batchEntity of registry.activeBatches) {
      const batchMesh = batchEntity.get(BatchMesh)
      if (batchMesh?.mesh) activeMeshes.add(batchMesh.mesh)
    }

    // Remove stale BATCH MESHES only. The group's children also include
    // non-batch objects — sprites demoted to standalone via a user
    // `renderOrder` write (reparented here by `_demoteToStandalone`) and
    // foreign Object3Ds routed through `SpriteGroup.add`'s super path —
    // which this system does not manage and must never evict.
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const child = parent.children[i]
      if (child && (child as Partial<SpriteBatch>).isSpriteBatch === true && !activeMeshes.has(child)) {
        parentRemove.call(parent, child)
      }
    }

    // Add new batches and set renderOrder. The batch's renderOrder IS
    // the sortLayer's declared numeric order — that's the documented
    // interop contract (foreign objects place themselves relative to
    // `flatland.sortLayer(name).renderOrder`). Batches sharing a layer
    // get a tiny deterministic sub-order so same-layer draw order is
    // stable without ever crossing into the next integer layer.
    let prevLayer = Number.NaN
    let subOrder = 0
    for (let i = 0; i < registry.activeBatches.length; i++) {
      const batchEntity = registry.activeBatches[i]!
      const batchMesh = batchEntity.get(BatchMesh)
      if (!batchMesh?.mesh) continue

      const sortLayer = batchEntity.get(BatchMeta)?.sortLayer ?? 0
      subOrder = sortLayer === prevLayer ? subOrder + 1 : 0
      prevLayer = sortLayer
      batchMesh.mesh.renderOrder = sortLayer + subOrder * 1e-6
      if (!parent.children.includes(batchMesh.mesh)) {
        parentAdd.call(parent, batchMesh.mesh)
      }
    }
  }
}
