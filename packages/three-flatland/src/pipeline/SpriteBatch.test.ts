import { describe, it, expect, beforeEach } from 'vitest'
import { Matrix4, Texture } from 'three'
import { SpriteBatch } from './SpriteBatch'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2D } from '../sprites/Sprite2D'
import { MAX_BATCH_SIZE } from '../internal/max-batch-size'
import { getSpriteBatchOwnership } from '../internal/sprite-batch-ownership'

const INVALID_BATCH_SIZES = [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, MAX_BATCH_SIZE + 1]

let nextEntity = 1 << 20

function claimSlot(batch: SpriteBatch): number {
  const ownership = getSpriteBatchOwnership(batch)
  const slot = ownership.reserveSlot()
  if (slot < 0) return slot
  ownership.commitSlot(slot, nextEntity++, new Sprite2D({ material: batch.spriteMaterial }))
  return slot
}

function releaseOwnedSlot(batch: SpriteBatch, slot: number): void {
  const ownership = getSpriteBatchOwnership(batch)
  ownership.releaseSlot(slot, ownership.slotEntities[slot]!)
}

describe('SpriteBatch', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    nextEntity = 1 << 20
    texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  it('should create an empty batch', () => {
    const batch = new SpriteBatch(material)

    expect(batch.activeCount).toBe(0)
    expect(batch.isEmpty).toBe(true)
    expect(batch.isFull).toBe(false)
    expect(batch.spriteMaterial).toBe(material)
  })

  it.each(INVALID_BATCH_SIZES)('rejects invalid capacity %s before construction', (maxSize) => {
    expect(() => new SpriteBatch(material, maxSize)).toThrow(
      `maxBatchSize must be a positive safe integer no greater than ${MAX_BATCH_SIZE}`
    )
  })

  it('should allocate slots sequentially', () => {
    const batch = new SpriteBatch(material)

    const slot0 = claimSlot(batch)
    const slot1 = claimSlot(batch)

    expect(slot0).toBe(0)
    expect(slot1).toBe(1)
    expect(batch.activeCount).toBe(2)
    expect(batch.isEmpty).toBe(false)
  })

  it('should return -1 when batch is full', () => {
    const batch = new SpriteBatch(material, 2) // Small batch for testing

    claimSlot(batch)
    claimSlot(batch)
    const slot3 = claimSlot(batch)

    expect(batch.isFull).toBe(true)
    expect(slot3).toBe(-1)
  })

  it('should free slots and reuse them', () => {
    const batch = new SpriteBatch(material)

    const slot0 = claimSlot(batch)
    claimSlot(batch) // slot 1

    // Free slot 0
    releaseOwnedSlot(batch, slot0)
    expect(batch.activeCount).toBe(1)

    // Next allocation should reuse freed slot 0
    const reused = claimSlot(batch)
    expect(reused).toBe(0)
    expect(batch.activeCount).toBe(2)
  })

  it('scrubs an unpublished interior row before returning it to the free list', () => {
    const batch = new SpriteBatch(material, 3)
    const ownership = getSpriteBatchOwnership(batch)
    claimSlot(batch)
    const interior = claimSlot(batch)
    claimSlot(batch)
    releaseOwnedSlot(batch, interior)

    const reserved = ownership.reserveSlot()
    const failedSprite = new Sprite2D({ material })
    batch.writeColor(reserved, 1, 1, 1, 1)
    batch.writeMatrix(reserved, new Matrix4().makeTranslation(12, 34, 0))
    batch.indexForPicking(failedSprite)

    // Assignment/reassignment rollback removes its unpublished broadphase
    // projection before returning the physical row.
    batch.grid.remove(failedSprite)
    ownership.rollbackSlot(reserved)

    expect(reserved).toBe(interior)
    expect(ownership.slotEntities[interior]).toBe(0)
    expect(Array.from((batch.instanceMatrix.array as Float32Array).slice(interior * 16, interior * 16 + 16))).toEqual(
      Array(16).fill(0)
    )
    expect((batch.getColorAttribute().array as Float32Array)[interior * 16 + 4 + 3]).toBe(0)
    expect(batch.grid.size).toBe(0)
  })

  it('publishes a nonzero packed owner for physical slot zero', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const slot = claimSlot(batch)

    expect(slot).toBe(0)
    expect(ownership.slotEntities[slot]).toBe(1 << 20)
    expect(ownership.spriteAtSlot(slot)).toBeInstanceOf(Sprite2D)
  })

  it('keeps holes explicit without disturbing later owners', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const secondEntity = ownership.slotEntities[second]
    const secondSprite = ownership.spriteAtSlot(second)

    releaseOwnedSlot(batch, first)

    expect(ownership.slotEntities[first]).toBe(0)
    expect(ownership.spriteAtSlot(first)).toBeNull()
    expect(ownership.slotEntities[second]).toBe(secondEntity)
    expect(ownership.spriteAtSlot(second)).toBe(secondSprite)
    expect(ownership.slotSpan()).toBe(2)
  })

  it('collapses released tail holes and lazily discards stale free entries', () => {
    const batch = new SpriteBatch(material, 8)
    const ownership = getSpriteBatchOwnership(batch)
    const slots = Array.from({ length: 8 }, () => claimSlot(batch))
    batch.syncCount()
    expect(batch.count).toBe(8)

    for (const slot of [7, 3, 6, 2, 5, 1, 4]) releaseOwnedSlot(batch, slots[slot]!)
    batch.syncCount()

    expect(batch.activeCount).toBe(1)
    expect(ownership.slotSpan()).toBe(1)
    expect(batch.count).toBe(1)
    expect(ownership.slotEntities[0]).not.toBe(0)

    const reused = claimSlot(batch)
    expect(reused).toBe(1)
    batch.syncCount()
    expect(batch.count).toBe(2)
    releaseOwnedSlot(batch, reused)
    batch.syncCount()
    expect(ownership.slotSpan()).toBe(1)
    expect(batch.count).toBe(1)
  })

  it('rejects stale, foreign, and double releases without changing ownership', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const slot = claimSlot(batch)
    const owner = ownership.slotEntities[slot]!

    expect(() => ownership.releaseSlot(slot, owner + 1)).toThrow('not owned')
    expect(batch.activeCount).toBe(1)
    expect(ownership.slotEntities[slot]).toBe(owner)

    ownership.releaseSlot(slot, owner)
    expect(() => ownership.releaseSlot(slot, owner)).toThrow('not owned')
    expect(batch.activeCount).toBe(0)
  })

  it('keeps reservations reusable when a commit fails before publication', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const slot = ownership.reserveSlot()
    const sprite = new Sprite2D({ material })

    expect(() => ownership.commitSlot(slot, 0, sprite)).toThrow('Entity handle 0')
    expect(batch.activeCount).toBe(0)
    expect(ownership.slotEntities[slot]).toBe(0)
    expect(ownership.spriteAtSlot(slot)).toBeNull()

    ownership.commitSlot(slot, nextEntity++, sprite)
    expect(batch.activeCount).toBe(1)
    expect(ownership.spriteAtSlot(slot)).toBe(sprite)
  })

  it('rejects hole and out-of-range swaps without changing ownership', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const occupied = claimSlot(batch)
    const hole = claimSlot(batch)
    claimSlot(batch) // keep the released row inside the active span
    const owner = ownership.slotEntities[occupied]!
    releaseOwnedSlot(batch, hole)

    expect(() => ownership.swapSlots(occupied, hole)).toThrow('stable membership')
    expect(() => ownership.swapSlots(occupied, ownership.slotSpan())).toThrow('outside the active span')
    expect(ownership.slotEntities[occupied]).toBe(owner)
    expect(ownership.slotEntities[hole]).toBe(0)
  })

  it('reset clears every owner and sprite reference', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    claimSlot(batch)
    claimSlot(batch)
    const retainedSprites = ownership.memberSprites.slice(0, 2)

    ownership.resetSlots()

    expect(ownership.slotEntities.slice(0, 2)).toEqual([0, 0])
    expect(ownership.spriteAtSlot(0)).toBeNull()
    expect(ownership.spriteAtSlot(1)).toBeNull()
    expect(batch.activeCount).toBe(0)
    expect(ownership.memberSprites.slice(0, 2)).toEqual([null, null])
    expect(() => ownership.memberSlotAt(0)).toThrow('outside the active span')
    expect(retainedSprites.every((sprite) => sprite !== null)).toBe(true)
  })

  it('swaps entity and sprite ownership with the physical rows', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const firstEntity = ownership.slotEntities[first]
    const secondEntity = ownership.slotEntities[second]
    const firstSprite = ownership.spriteAtSlot(first)
    const secondSprite = ownership.spriteAtSlot(second)
    const stableSprites = ownership.memberSprites.slice(0, 2)

    ownership.swapSlots(first, second)

    expect(ownership.slotEntities[first]).toBe(secondEntity)
    expect(ownership.slotEntities[second]).toBe(firstEntity)
    expect(ownership.spriteAtSlot(first)).toBe(secondSprite)
    expect(ownership.spriteAtSlot(second)).toBe(firstSprite)
    expect(ownership.memberSprites.slice(0, 2)).toEqual(stableSprites)
    expect([ownership.memberSlotAt(0), ownership.memberSlotAt(1)]).toEqual([second, first])
  })

  it('releases and reuses stable traversal rows independently of sorted physical slots', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const firstEntity = ownership.slotEntities[first]!
    const firstSprite = ownership.spriteAtSlot(first)!

    ownership.swapSlots(first, second)
    ownership.releaseSlot(second, firstEntity)

    expect(ownership.memberSpan()).toBe(1)
    expect(ownership.memberSprites[0]).not.toBe(firstSprite)
    expect(ownership.memberSlotAt(0)).toBe(first)

    const reusedPhysical = claimSlot(batch)
    expect(reusedPhysical).toBe(second)
    expect(ownership.memberSprites[0]).not.toBe(firstSprite)
    expect([ownership.memberSlotAt(0), ownership.memberSlotAt(1)]).toEqual([first, second])
    expect(ownership.memberSprites[1]).not.toBeNull()
  })

  it('should set alpha to 0 when freeing a slot', () => {
    const batch = new SpriteBatch(material)

    const slot = claimSlot(batch)
    // Write visible color
    batch.writeColor(slot, 1, 1, 1, 1)

    // Free the slot
    releaseOwnedSlot(batch, slot)

    // Alpha should be 0 (invisible). All core attributes share one
    // interleaved buffer with stride INSTANCE_STRIDE=16 and color at
    // offset 4; alpha is component 3 of color.
    const colorAttr = batch.getColorAttribute()
    const array = colorAttr.array as Float32Array
    expect(array[slot * 16 + 4 + 3]).toBe(0)
  })

  it('should write and read color data', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)

    batch.writeColor(slot, 1, 0, 0, 0.5)

    const colorAttr = batch.getColorAttribute()
    const array = colorAttr.array as Float32Array
    // Interleaved layout: stride 16 per instance, color at offset 4.
    expect(array[slot * 16 + 4 + 0]).toBeCloseTo(1) // r
    expect(array[slot * 16 + 4 + 1]).toBeCloseTo(0) // g
    expect(array[slot * 16 + 4 + 2]).toBeCloseTo(0) // b
    expect(array[slot * 16 + 4 + 3]).toBeCloseTo(0.5) // a
  })

  it('should write and read UV data', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)

    batch.writeUV(slot, 0.25, 0.5, 0.25, 0.25)

    const uvAttr = batch.getUVAttribute()
    const array = uvAttr.array as Float32Array
    // Interleaved layout: stride 16, UV at offset 0.
    expect(array[slot * 16 + 0]).toBeCloseTo(0.25)
    expect(array[slot * 16 + 1]).toBeCloseTo(0.5)
    expect(array[slot * 16 + 2]).toBeCloseTo(0.25)
    expect(array[slot * 16 + 3]).toBeCloseTo(0.25)
  })

  it('should write and read flip data', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)

    batch.writeFlip(slot, -1, 1)

    // Flip lives at `instanceSystem.xy` — offset 8/9 within the stride.
    const systemAttr = batch.getSystemAttribute()
    const array = systemAttr.array as Float32Array
    expect(array[slot * 16 + 8]).toBe(-1) // x flipped
    expect(array[slot * 16 + 9]).toBe(1) // y normal
  })

  it('does not duplicate moving matrix translations into the core attribute', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)
    const matrix = new Matrix4().makeTranslation(12.25, -7.5, 3)

    batch.writeMatrix(slot, matrix)

    const extras = batch.geometry.getAttribute('instanceExtras')
    expect([extras.getY(slot), extras.getZ(slot), extras.getW(slot)]).toEqual([0, 0, 0])
    expect(Reflect.get(batch, '_matrixTracker').isDirty).toBe(true)
    expect(Reflect.get(batch, '_interleavedTracker').isDirty).toBe(false)
  })

  it('should reset all slots', () => {
    const batch = new SpriteBatch(material)
    const ownership = getSpriteBatchOwnership(batch)

    claimSlot(batch)
    claimSlot(batch)
    expect(batch.activeCount).toBe(2)

    ownership.resetSlots()

    expect(batch.activeCount).toBe(0)
    expect(batch.isEmpty).toBe(true)
    expect(batch.count).toBe(0)
  })

  it('should sync instance count', () => {
    const batch = new SpriteBatch(material)

    claimSlot(batch)
    claimSlot(batch)

    // count starts at 0 from constructor
    expect(batch.count).toBe(0)

    batch.syncCount()

    // After sync, count matches allocated range
    expect(batch.count).toBe(2)
  })

  it('should handle effect data via custom attributes', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    material.registerEffect(Dissolve)
    const batch = new SpriteBatch(material)

    const slot = claimSlot(batch)

    // Write effect data to the packed effect buffer
    batch.writeEffectSlot(slot, 0, 0, 0.8)

    // Verify the custom attribute exists
    const customBuf = batch.getCustomBuffer('effectBuf0')
    expect(customBuf).toBeDefined()
    expect(customBuf!.buffer[slot * 4 + 0]).toBeCloseTo(0.8)
  })

  it('should write custom attributes', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    material.registerEffect(Dissolve)
    const batch = new SpriteBatch(material)

    const slot = claimSlot(batch)

    batch.writeCustom(slot, 'effectBuf0', [0.5, 0.3, 0.0, 1.0])

    const custom = batch.getCustomBuffer('effectBuf0')
    expect(custom).toBeDefined()
    expect(custom!.buffer[slot * 4 + 0]).toBeCloseTo(0.5)
    expect(custom!.buffer[slot * 4 + 1]).toBeCloseTo(0.3)
  })

  it('should dispose correctly', () => {
    const batch = new SpriteBatch(material)

    claimSlot(batch)
    claimSlot(batch)

    batch.dispose()

    expect(batch.activeCount).toBe(0)
  })
})

describe('freed slots', () => {
  it('collapse to a zero-scale matrix (no fragments rasterized) and zero alpha', () => {
    const material = new Sprite2DMaterial()
    const batch = new SpriteBatch(material, 8)
    const slot = claimSlot(batch)
    const matrix = new Matrix4().makeScale(3, 3, 1)
    batch.writeMatrix(slot, matrix)
    batch.writeColor(slot, 1, 1, 1, 1)

    releaseOwnedSlot(batch, slot)

    const m = batch.instanceMatrix.array as Float32Array
    for (let i = 0; i < 16; i++) {
      expect(m[slot * 16 + i]).toBe(0)
    }
    const color = batch.getColorAttribute()
    expect(color.getW(slot)).toBe(0)
  })
})
