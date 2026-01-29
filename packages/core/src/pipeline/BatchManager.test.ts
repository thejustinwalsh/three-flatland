import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { BatchManager } from './BatchManager'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Layers } from './layers'

describe('BatchManager', () => {
  let texture: Texture
  let material1: Sprite2DMaterial
  let material2: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material1 = new Sprite2DMaterial({ map: texture })
    material2 = new Sprite2DMaterial({ map: texture })
  })

  it('should create an empty manager', () => {
    const manager = new BatchManager()

    expect(manager.isEmpty).toBe(true)
    expect(manager.spriteCount).toBe(0)
    expect(manager.batchCount).toBe(0)
  })

  it('should add sprites', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material1 })

    manager.add(sprite1)
    manager.add(sprite2)

    expect(manager.spriteCount).toBe(2)
    expect(manager.isEmpty).toBe(false)
  })

  it('should not add duplicate sprites', () => {
    const manager = new BatchManager()
    const sprite = new Sprite2D({ material: material1 })

    manager.add(sprite)
    manager.add(sprite)

    expect(manager.spriteCount).toBe(1)
  })

  it('should remove sprites', () => {
    const manager = new BatchManager()
    const sprite = new Sprite2D({ material: material1 })

    manager.add(sprite)
    manager.remove(sprite)

    expect(manager.spriteCount).toBe(0)
  })

  it('should prepare batches', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material1 })

    manager.add(sprite1)
    manager.add(sprite2)
    manager.prepare()

    expect(manager.batchCount).toBe(1)
    expect(manager.getBatches()).toHaveLength(1)
  })

  it('should group sprites by material', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material2 })

    manager.add(sprite1)
    manager.add(sprite2)
    manager.prepare()

    // Should create separate batches for different materials
    expect(manager.batchCount).toBe(2)
  })

  it('should sort sprites by layer', () => {
    const manager = new BatchManager()
    const spriteBackground = new Sprite2D({ material: material1 })
    const spriteEntities = new Sprite2D({ material: material1 })

    spriteBackground.layer = Layers.BACKGROUND
    spriteEntities.layer = Layers.ENTITIES

    manager.add(spriteEntities)
    manager.add(spriteBackground)
    manager.prepare()

    // Sprites should be sorted by layer
    const batches = manager.getBatches()
    expect(batches.length).toBeGreaterThan(0)
  })

  it('should create separate batches for different layers even with same material', () => {
    const manager = new BatchManager()
    // Same material, different layers
    const spriteGround = new Sprite2D({ material: material1 })
    const spriteEntities = new Sprite2D({ material: material1 })
    const spriteForeground = new Sprite2D({ material: material1 })

    spriteGround.layer = Layers.GROUND
    spriteEntities.layer = Layers.ENTITIES
    spriteForeground.layer = Layers.FOREGROUND

    manager.add(spriteGround)
    manager.add(spriteEntities)
    manager.add(spriteForeground)
    manager.prepare()

    // Must create separate batches for each layer
    // GPU instance order is undefined, so mixing layers in one batch would break draw order
    expect(manager.batchCount).toBe(3)
  })

  it('should sort sprites by zIndex within layer', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material1 })

    sprite1.layer = Layers.ENTITIES
    sprite1.zIndex = 100
    sprite2.layer = Layers.ENTITIES
    sprite2.zIndex = 50

    manager.add(sprite1)
    manager.add(sprite2)
    manager.prepare()

    expect(manager.batchCount).toBe(1)
  })

  it('should invalidate sprites', () => {
    const manager = new BatchManager()
    const sprite = new Sprite2D({ material: material1 })
    sprite.layer = Layers.ENTITIES
    sprite.zIndex = 50

    manager.add(sprite)
    manager.prepare()

    // Change sprite layer
    sprite.layer = Layers.UI
    manager.invalidate(sprite)
    manager.prepare()

    expect(manager.batchCount).toBe(1)
  })

  it('should invalidate all sprites', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material1 })

    manager.add(sprite1)
    manager.add(sprite2)
    manager.prepare()

    manager.invalidateAll()
    manager.prepare()

    expect(manager.batchCount).toBe(1)
  })

  it('should upload batches', () => {
    const manager = new BatchManager()
    const sprite = new Sprite2D({ material: material1 })

    manager.add(sprite)
    manager.prepare()
    manager.upload()

    const batches = manager.getBatches()
    // After upload, batch should have correct instance count
    expect(batches[0]!.count).toBeGreaterThan(0)
  })

  it('should provide render stats', () => {
    const manager = new BatchManager()
    const sprite1 = new Sprite2D({ material: material1 })
    const sprite2 = new Sprite2D({ material: material2 })

    manager.add(sprite1)
    manager.add(sprite2)
    manager.prepare()

    const stats = manager.getStats()

    expect(stats.spriteCount).toBe(2)
    expect(stats.batchCount).toBe(2)
    expect(stats.drawCalls).toBe(2)
    expect(stats.visibleSprites).toBe(2)
  })

  it('should clear all sprites and batches', () => {
    const manager = new BatchManager()
    const sprite = new Sprite2D({ material: material1 })

    manager.add(sprite)
    manager.prepare()
    manager.clear()

    expect(manager.isEmpty).toBe(true)
    expect(manager.batchCount).toBe(0)
  })
})
