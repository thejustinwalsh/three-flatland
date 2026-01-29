import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { SpriteGroup, Renderer2D } from './SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Layers } from './layers'

describe('SpriteGroup', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  it('should create a sprite group with default options', () => {
    const group = new SpriteGroup()

    expect(group.name).toBe('SpriteGroup')
    expect(group.isEmpty).toBe(true)
    expect(group.autoSort).toBe(true)
    expect(group.frustumCulling).toBe(true)
  })

  it('should create a sprite group with custom options', () => {
    const group = new SpriteGroup({
      maxBatchSize: 5000,
      autoSort: false,
      frustumCulling: false,
    })

    expect(group.autoSort).toBe(false)
    expect(group.frustumCulling).toBe(false)
  })

  it('should add sprites', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    group.add(sprite)

    expect(group.spriteCount).toBe(1)
    expect(group.isEmpty).toBe(false)
  })

  it('should add multiple sprites', () => {
    const group = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    group.addSprites(sprite1, sprite2)

    expect(group.spriteCount).toBe(2)
  })

  it('should remove sprites', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    group.add(sprite)
    group.remove(sprite)

    expect(group.spriteCount).toBe(0)
  })

  it('should remove multiple sprites', () => {
    const group = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    group.addSprites(sprite1, sprite2)
    group.removeSprites(sprite1, sprite2)

    expect(group.spriteCount).toBe(0)
  })

  it('should update batches', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    group.add(sprite)
    group.update()

    expect(group.batchCount).toBe(1)
  })

  it('should invalidate sprites', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    group.add(sprite)
    group.update()

    sprite.layer = Layers.UI
    group.invalidate(sprite)
    group.update()

    expect(group.batchCount).toBe(1)
  })

  it('should invalidate all sprites', () => {
    const group = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    group.addSprites(sprite1, sprite2)
    group.update()

    group.invalidateAll()
    group.update()

    expect(group.batchCount).toBe(1)
  })

  it('should provide render stats', () => {
    const group = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    group.addSprites(sprite1, sprite2)
    group.update()

    const stats = group.stats

    expect(stats.spriteCount).toBe(2)
    expect(stats.batchCount).toBe(1)
    expect(stats.drawCalls).toBe(1)
    expect(stats.visibleSprites).toBe(2)
  })

  it('should clear all sprites', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    group.add(sprite)
    group.update()
    group.clear()

    expect(group.isEmpty).toBe(true)
    expect(group.batchCount).toBe(0)
    expect(group.children.length).toBe(0)
  })

  it('should add batch objects to scene graph', () => {
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    group.add(sprite)
    group.update()

    expect(group.children.length).toBe(1)
  })

  // Backwards compatibility test
  it('should export Renderer2D as alias', () => {
    expect(Renderer2D).toBe(SpriteGroup)

    const renderer = new Renderer2D()
    expect(renderer).toBeInstanceOf(SpriteGroup)
  })
})
