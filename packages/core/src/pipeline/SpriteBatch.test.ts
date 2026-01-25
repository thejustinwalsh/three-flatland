import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { SpriteBatch } from './SpriteBatch'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

describe('SpriteBatch', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
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
  })

  it('should upload batch data', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    batch.addSprite(sprite)
    batch.upload()

    expect(batch.isDirty).toBe(false)
    expect(batch.count).toBe(1)
  })

  it('should handle custom instance attributes', () => {
    material.addInstanceFloat('dissolve', 0.5)
    const batch = new SpriteBatch(material)

    const sprite = new Sprite2D({ material })
    sprite.setInstanceValue('dissolve', 0.8)

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

  it('should rebuild batch after modifications', () => {
    const batch = new SpriteBatch(material)
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    batch.addSprite(sprite)
    batch.upload()

    // Modify sprite
    sprite.position.set(200, 300, 0)
    batch.rebuild()

    expect(batch.isDirty).toBe(true)
  })
})
