import { describe, it, expect, beforeEach } from 'vitest'
import { Matrix4, Texture } from 'three'
import { SpriteBatch } from './SpriteBatch'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2D } from '../sprites/Sprite2D'

let nextEntity = 1 << 20

function claimSlot(batch: SpriteBatch): number {
  const slot = batch.reserveSlot()
  if (slot < 0) return slot
  batch.commitSlot(slot, nextEntity++, new Sprite2D({ material: batch.spriteMaterial }))
  return slot
}

function releaseOwnedSlot(batch: SpriteBatch, slot: number): void {
  batch.releaseSlot(slot, batch.slotEntities[slot]!)
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

  it('publishes a nonzero packed owner for physical slot zero', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)

    expect(slot).toBe(0)
    expect(batch.slotEntities[slot]).toBe(1 << 20)
    expect(batch.spriteAtSlot(slot)).toBeInstanceOf(Sprite2D)
  })

  it('keeps holes explicit without disturbing later owners', () => {
    const batch = new SpriteBatch(material)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const secondEntity = batch.slotEntities[second]
    const secondSprite = batch.spriteAtSlot(second)

    releaseOwnedSlot(batch, first)

    expect(batch.slotEntities[first]).toBe(0)
    expect(batch.spriteAtSlot(first)).toBeNull()
    expect(batch.slotEntities[second]).toBe(secondEntity)
    expect(batch.spriteAtSlot(second)).toBe(secondSprite)
    expect(batch.slotSpan).toBe(2)
  })

  it('rejects stale, foreign, and double releases without changing ownership', () => {
    const batch = new SpriteBatch(material)
    const slot = claimSlot(batch)
    const owner = batch.slotEntities[slot]!

    expect(() => batch.releaseSlot(slot, owner + 1)).toThrow('not owned')
    expect(batch.activeCount).toBe(1)
    expect(batch.slotEntities[slot]).toBe(owner)

    batch.releaseSlot(slot, owner)
    expect(() => batch.releaseSlot(slot, owner)).toThrow('not owned')
    expect(batch.activeCount).toBe(0)
  })

  it('keeps reservations reusable when a commit fails before publication', () => {
    const batch = new SpriteBatch(material)
    const slot = batch.reserveSlot()
    const sprite = new Sprite2D({ material })

    expect(() => batch.commitSlot(slot, 0, sprite)).toThrow('Entity handle 0')
    expect(batch.activeCount).toBe(0)
    expect(batch.slotEntities[slot]).toBe(0)
    expect(batch.spriteAtSlot(slot)).toBeNull()

    batch.commitSlot(slot, nextEntity++, sprite)
    expect(batch.activeCount).toBe(1)
    expect(batch.spriteAtSlot(slot)).toBe(sprite)
  })

  it('rejects hole and out-of-range swaps without changing ownership', () => {
    const batch = new SpriteBatch(material)
    const occupied = claimSlot(batch)
    const hole = claimSlot(batch)
    const owner = batch.slotEntities[occupied]!
    releaseOwnedSlot(batch, hole)

    expect(() => batch.swapSlots(occupied, hole)).toThrow('stable membership')
    expect(() => batch.swapSlots(occupied, batch.slotSpan)).toThrow('outside the active span')
    expect(batch.slotEntities[occupied]).toBe(owner)
    expect(batch.slotEntities[hole]).toBe(0)
  })

  it('reset clears every owner and sprite reference', () => {
    const batch = new SpriteBatch(material)
    claimSlot(batch)
    claimSlot(batch)
    const retainedSprites = batch.memberSprites.slice(0, 2)

    batch.resetSlots()

    expect(batch.slotEntities.slice(0, 2)).toEqual([0, 0])
    expect(batch.spriteAtSlot(0)).toBeNull()
    expect(batch.spriteAtSlot(1)).toBeNull()
    expect(batch.activeCount).toBe(0)
    expect(retainedSprites.every((sprite) => sprite !== null)).toBe(true)
  })

  it('swaps entity and sprite ownership with the physical rows', () => {
    const batch = new SpriteBatch(material)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const firstEntity = batch.slotEntities[first]
    const secondEntity = batch.slotEntities[second]
    const firstSprite = batch.spriteAtSlot(first)
    const secondSprite = batch.spriteAtSlot(second)
    const stableSprites = batch.memberSprites.slice(0, 2)

    batch.swapSlots(first, second)

    expect(batch.slotEntities[first]).toBe(secondEntity)
    expect(batch.slotEntities[second]).toBe(firstEntity)
    expect(batch.spriteAtSlot(first)).toBe(secondSprite)
    expect(batch.spriteAtSlot(second)).toBe(firstSprite)
    expect(batch.memberSprites.slice(0, 2)).toEqual(stableSprites)
    expect(Array.from(batch.memberSlots.slice(0, 2))).toEqual([second, first])
  })

  it('releases and reuses stable traversal rows independently of sorted physical slots', () => {
    const batch = new SpriteBatch(material)
    const first = claimSlot(batch)
    const second = claimSlot(batch)
    const firstEntity = batch.slotEntities[first]!
    const firstSprite = batch.spriteAtSlot(first)!

    batch.swapSlots(first, second)
    batch.releaseSlot(second, firstEntity)

    expect(batch.memberSpan).toBe(1)
    expect(batch.memberSprites[0]).not.toBe(firstSprite)
    expect(batch.memberSlots[0]).toBe(first)

    const reusedPhysical = claimSlot(batch)
    expect(reusedPhysical).toBe(second)
    expect(batch.memberSprites[0]).not.toBe(firstSprite)
    expect(Array.from(batch.memberSlots.slice(0, 2))).toEqual([first, second])
    expect(batch.memberSprites[1]).not.toBeNull()
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

    claimSlot(batch)
    claimSlot(batch)
    expect(batch.activeCount).toBe(2)

    batch.resetSlots()

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
