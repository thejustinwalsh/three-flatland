import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { SpriteBatch } from './SpriteBatch'
import { Sprite2D } from '../sprites/Sprite2D'
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

    expect(batch.spriteCount).toBe(0)
    expect(batch.isEmpty).toBe(true)
    expect(batch.isFull).toBe(false)
    expect(batch.spriteMaterial).toBe(material)
  })

  it('should add sprites to the batch', () => {
    const batch = new SpriteBatch(material)
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    const index1 = batch.addSprite(sprite1)
    const index2 = batch.addSprite(sprite2)

    expect(index1).toBe(0)
    expect(index2).toBe(1)
    expect(batch.spriteCount).toBe(2)
    expect(batch.isEmpty).toBe(false)
  })

  it('should attach sprite to batch when added', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })

    expect(sprite._batchTarget).toBe(null)
    expect(sprite._batchIndex).toBe(-1)

    batch.addSprite(sprite)

    expect(sprite._batchTarget).toBe(batch)
    expect(sprite._batchIndex).toBe(0)
  })

  it('should return -1 when batch is full', () => {
    const batch = new SpriteBatch(material, 2) // Small batch for testing
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })
    const sprite3 = new Sprite2D({ material })

    batch.addSprite(sprite1)
    batch.addSprite(sprite2)
    const index3 = batch.addSprite(sprite3)

    expect(batch.isFull).toBe(true)
    expect(index3).toBe(-1)
  })

  it('should clear all sprites', () => {
    const batch = new SpriteBatch(material)
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    batch.addSprite(sprite1)
    batch.addSprite(sprite2)
    batch.clearSprites()

    expect(batch.spriteCount).toBe(0)
    expect(batch.isEmpty).toBe(true)
    // Sprites should be detached
    expect(sprite1._batchTarget).toBe(null)
    expect(sprite2._batchTarget).toBe(null)
  })

  it('should upload batch data', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    batch.addSprite(sprite)
    batch.invalidateTransforms()
    batch.upload()

    expect(batch.count).toBe(1)
  })

  it('should handle effect data in packed buffers', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    material.registerEffect(Dissolve)
    const batch = new SpriteBatch(material)

    const sprite = new Sprite2D({ material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.8
    sprite.addEffect(dissolve)

    batch.addSprite(sprite)
    batch.upload()

    expect(batch.spriteCount).toBe(1)
  })

  it('should get sprites in batch', () => {
    const batch = new SpriteBatch(material)
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    batch.addSprite(sprite1)
    batch.addSprite(sprite2)

    const sprites = batch.getSprites()

    expect(sprites).toHaveLength(2)
    expect(sprites).toContain(sprite1)
    expect(sprites).toContain(sprite2)
  })

  it('should sync sprite properties to batch buffers on attachment', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })

    // Set tint BEFORE adding to batch — _syncToBatch picks it up
    sprite.tint = [1, 0, 0]

    batch.addSprite(sprite)

    // Verify color was synced to batch buffer during _attachToBatch → _syncToBatch
    const colorAttr = batch.getColorAttribute()
    const array = colorAttr.array as Float32Array
    expect(array[0]).toBeCloseTo(1) // r
    expect(array[1]).toBeCloseTo(0) // g
    expect(array[2]).toBeCloseTo(0) // b
  })

  it('should remove sprite and reuse slot', () => {
    const batch = new SpriteBatch(material)
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })
    const sprite3 = new Sprite2D({ material })

    batch.addSprite(sprite1) // index 0
    batch.addSprite(sprite2) // index 1

    // Remove sprite1
    batch.removeSprite(sprite1)
    expect(batch.spriteCount).toBe(1)
    expect(sprite1._batchTarget).toBe(null)

    // Add sprite3 - should reuse freed slot
    const index3 = batch.addSprite(sprite3)
    expect(index3).toBe(0) // Reused slot 0
    expect(batch.spriteCount).toBe(2)
  })

  it('should detach sprite when removed', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })

    batch.addSprite(sprite)
    expect(sprite._batchTarget).toBe(batch)

    batch.removeSprite(sprite)
    expect(sprite._batchTarget).toBe(null)
    expect(sprite._batchIndex).toBe(-1)
  })
})
