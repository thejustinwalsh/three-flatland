import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { Renderer2D } from './Renderer2D'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Layers } from './layers'

describe('Renderer2D', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  it('should create a renderer with default options', () => {
    const renderer = new Renderer2D()

    expect(renderer.name).toBe('Renderer2D')
    expect(renderer.isEmpty).toBe(true)
    expect(renderer.autoSort).toBe(true)
    expect(renderer.frustumCulling).toBe(true)
  })

  it('should create a renderer with custom options', () => {
    const renderer = new Renderer2D({
      maxBatchSize: 5000,
      autoSort: false,
      frustumCulling: false,
    })

    expect(renderer.autoSort).toBe(false)
    expect(renderer.frustumCulling).toBe(false)
  })

  it('should add sprites', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)

    expect(renderer.spriteCount).toBe(1)
    expect(renderer.isEmpty).toBe(false)
  })

  it('should add multiple sprites', () => {
    const renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(2)
  })

  it('should remove sprites', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.remove(sprite)

    expect(renderer.spriteCount).toBe(0)
  })

  it('should remove multiple sprites', () => {
    const renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.removeSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(0)
  })

  it('should update batches', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    renderer.add(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate sprites', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    sprite.layer = Layers.UI
    renderer.invalidate(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate all sprites', () => {
    const renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.update()

    renderer.invalidateAll()
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should provide render stats', () => {
    const renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.update()

    const stats = renderer.stats

    expect(stats.spriteCount).toBe(2)
    expect(stats.batchCount).toBe(1)
    expect(stats.drawCalls).toBe(1)
    expect(stats.visibleSprites).toBe(2)
  })

  it('should clear all sprites', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()
    renderer.clear()

    expect(renderer.isEmpty).toBe(true)
    expect(renderer.batchCount).toBe(0)
    expect(renderer.children.length).toBe(0)
  })

  it('should add batch objects to scene graph', () => {
    const renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    expect(renderer.children.length).toBe(1)
  })
})
