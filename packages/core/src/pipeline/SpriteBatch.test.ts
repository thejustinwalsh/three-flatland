import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { SpriteBatch } from './SpriteBatch'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'

describe('SpriteBatch', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
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

    const slot0 = batch.allocateSlot()
    const slot1 = batch.allocateSlot()

    expect(slot0).toBe(0)
    expect(slot1).toBe(1)
    expect(batch.activeCount).toBe(2)
    expect(batch.isEmpty).toBe(false)
  })

  it('should return -1 when batch is full', () => {
    const batch = new SpriteBatch(material, 2) // Small batch for testing

    batch.allocateSlot()
    batch.allocateSlot()
    const slot3 = batch.allocateSlot()

    expect(batch.isFull).toBe(true)
    expect(slot3).toBe(-1)
  })

  it('should free slots and reuse them', () => {
    const batch = new SpriteBatch(material)

    const slot0 = batch.allocateSlot()
    batch.allocateSlot() // slot 1

    // Free slot 0
    batch.freeSlot(slot0)
    expect(batch.activeCount).toBe(1)

    // Next allocation should reuse freed slot 0
    const reused = batch.allocateSlot()
    expect(reused).toBe(0)
    expect(batch.activeCount).toBe(2)
  })

  it('should set alpha to 0 when freeing a slot', () => {
    const batch = new SpriteBatch(material)

    const slot = batch.allocateSlot()
    // Write visible color
    batch.writeColor(slot, 1, 1, 1, 1)

    // Free the slot
    batch.freeSlot(slot)

    // Alpha should be 0 (invisible)
    const colorAttr = batch.getColorAttribute()
    const array = colorAttr.array as Float32Array
    expect(array[slot * 4 + 3]).toBe(0)
  })

  it('should write and read color data', () => {
    const batch = new SpriteBatch(material)
    const slot = batch.allocateSlot()

    batch.writeColor(slot, 1, 0, 0, 0.5)

    const colorAttr = batch.getColorAttribute()
    const array = colorAttr.array as Float32Array
    expect(array[slot * 4 + 0]).toBeCloseTo(1) // r
    expect(array[slot * 4 + 1]).toBeCloseTo(0) // g
    expect(array[slot * 4 + 2]).toBeCloseTo(0) // b
    expect(array[slot * 4 + 3]).toBeCloseTo(0.5) // a
  })

  it('should write and read UV data', () => {
    const batch = new SpriteBatch(material)
    const slot = batch.allocateSlot()

    batch.writeUV(slot, 0.25, 0.5, 0.25, 0.25)

    const uvAttr = batch.getUVAttribute()
    const array = uvAttr.array as Float32Array
    expect(array[slot * 4 + 0]).toBeCloseTo(0.25)
    expect(array[slot * 4 + 1]).toBeCloseTo(0.5)
    expect(array[slot * 4 + 2]).toBeCloseTo(0.25)
    expect(array[slot * 4 + 3]).toBeCloseTo(0.25)
  })

  it('should write and read flip data', () => {
    const batch = new SpriteBatch(material)
    const slot = batch.allocateSlot()

    batch.writeFlip(slot, -1, 1)

    const flipAttr = batch.getFlipAttribute()
    const array = flipAttr.array as Float32Array
    expect(array[slot * 2 + 0]).toBe(-1) // x flipped
    expect(array[slot * 2 + 1]).toBe(1)  // y normal
  })

  it('should reset all slots', () => {
    const batch = new SpriteBatch(material)

    batch.allocateSlot()
    batch.allocateSlot()
    expect(batch.activeCount).toBe(2)

    batch.resetSlots()

    expect(batch.activeCount).toBe(0)
    expect(batch.isEmpty).toBe(true)
    expect(batch.count).toBe(0)
  })

  it('should sync instance count', () => {
    const batch = new SpriteBatch(material)

    batch.allocateSlot()
    batch.allocateSlot()

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

    const slot = batch.allocateSlot()

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

    const slot = batch.allocateSlot()

    batch.writeCustom(slot, 'effectBuf0', [0.5, 0.3, 0.0, 1.0])

    const custom = batch.getCustomBuffer('effectBuf0')
    expect(custom).toBeDefined()
    expect(custom!.buffer[slot * 4 + 0]).toBeCloseTo(0.5)
    expect(custom!.buffer[slot * 4 + 1]).toBeCloseTo(0.3)
  })

  it('should dispose correctly', () => {
    const batch = new SpriteBatch(material)

    batch.allocateSlot()
    batch.allocateSlot()

    batch.dispose()

    expect(batch.activeCount).toBe(0)
  })
})
