import { select, type Entity, type World } from '../runtime'
import { BatchMesh, BatchSlot, BatchRegistry, IsBatched, SpriteZIndex } from '../traits'
import type { RegistryData } from '../batchUtils'
import { entitySlot } from '../snapshot'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-sort system bound to reusable permutation buffers.
 *
 * Dirty batches are traversed one at a time in physical-row order. This
 * preserves holes while keeping every ownership and GPU-buffer access local
 * to the batch being sorted. Materials that use GPU depth ordering remain
 * gated out exactly as before.
 */
export function createBatchSortSystem(): (world: World) => void {
  const sortedEntities: number[] = []
  const occupiedSlots: number[] = []
  let slotToSortedIndex = new Int32Array(0)

  function ensureSlotMapCapacity(length: number): void {
    if (slotToSortedIndex.length < length) {
      slotToSortedIndex = new Int32Array(Math.max(length, slotToSortedIndex.length * 2, 16))
    }
  }

  return function batchSortSystem(world: World): void {
    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return
    const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
    if (!registry) return

    const slotStore = world.store(BatchSlot)
    const batchEntityByEntity = slotStore.batchEntity
    const slotByEntity = slotStore.slot
    const zIndexByEntity = world.store(SpriteZIndex).zIndex

    for (const mesh of registry.batchSlots) {
      if (!mesh || !mesh.consumeSortDirty()) continue
      const material = mesh.spriteMaterial
      if (material.alphaTest > 0 && material.depthWrite) continue

      sortedEntities.length = 0
      occupiedSlots.length = 0
      const owners = mesh.slotEntities
      const sprites = mesh.slotSprites
      for (let slot = 0; slot < mesh.slotSpan; slot++) {
        const owner = owners[slot] ?? 0
        if (owner === 0) continue
        const entity = owner as Entity
        const index = entitySlot(entity)
        const batchEntity = batchEntityByEntity[index] as Entity
        if (
          !world.isAlive(entity) ||
          !world.has(entity, IsBatched) ||
          slotByEntity[index] !== slot ||
          !world.isAlive(batchEntity) ||
          world.read(batchEntity, BatchMesh)?.mesh !== mesh ||
          sprites[slot] !== registry.spriteArr[index]
        ) {
          throw new Error(`three-flatland: Batch slot ${slot} ownership is inconsistent`)
        }
        sortedEntities.push(owner)
        occupiedSlots.push(slot)
      }
      if (sortedEntities.length < 2) continue

      sortedEntities.sort((a, b) => zIndexByEntity[entitySlot(a as Entity)]! - zIndexByEntity[entitySlot(b as Entity)]!)

      ensureSlotMapCapacity(mesh.slotSpan)
      for (let index = 0; index < sortedEntities.length; index++) {
        const entity = sortedEntities[index] as Entity
        slotToSortedIndex[slotByEntity[entitySlot(entity)]!] = index
      }

      for (let index = 0; index < sortedEntities.length; index++) {
        const targetSlot = occupiedSlots[index]!
        const targetEntity = sortedEntities[index] as Entity
        const targetEntityIndex = entitySlot(targetEntity)
        const currentSlot = slotByEntity[targetEntityIndex]!
        if (currentSlot === targetSlot) continue

        const otherIndex = slotToSortedIndex[targetSlot]!
        if (otherIndex <= index) {
          throw new Error('three-flatland: Batch ownership permutation is inconsistent')
        }
        const otherEntity = sortedEntities[otherIndex] as Entity
        const otherEntityIndex = entitySlot(otherEntity)
        const targetSprite = registry.spriteArr[targetEntityIndex]
        const otherSprite = registry.spriteArr[otherEntityIndex]

        mesh.swapSlots(currentSlot, targetSlot)
        slotByEntity[targetEntityIndex] = targetSlot
        slotByEntity[otherEntityIndex] = currentSlot
        slotToSortedIndex[targetSlot] = index
        slotToSortedIndex[currentSlot] = otherIndex
        if (targetSprite) targetSprite._batchSlot = targetSlot
        if (otherSprite) otherSprite._batchSlot = currentSlot
      }
    }
  }
}
