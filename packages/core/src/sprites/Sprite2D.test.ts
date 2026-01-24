import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { Sprite2D } from './Sprite2D'

describe('Sprite2D', () => {
  let texture: Texture

  beforeEach(() => {
    // Create mock texture
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('should create a sprite with default options', () => {
    const sprite = new Sprite2D({ texture })

    expect(sprite).toBeInstanceOf(Sprite2D)
    expect(sprite.texture).toBe(texture)
    expect(sprite.alpha).toBe(1)
    expect(sprite.layer).toBe(0)
    expect(sprite.zIndex).toBe(0)
  })

  it('should set anchor correctly', () => {
    const sprite = new Sprite2D({ texture, anchor: [0.5, 1] })

    expect(sprite.anchor.x).toBe(0.5)
    expect(sprite.anchor.y).toBe(1)
  })

  it('should set tint correctly', () => {
    const sprite = new Sprite2D({ texture, tint: 0xff0000 })

    expect(sprite.tint.r).toBe(1)
    expect(sprite.tint.g).toBe(0)
    expect(sprite.tint.b).toBe(0)
  })

  it('should set alpha correctly', () => {
    const sprite = new Sprite2D({ texture, alpha: 0.5 })

    expect(sprite.alpha).toBe(0.5)
  })

  it('should flip correctly', () => {
    const sprite = new Sprite2D({ texture })

    sprite.flip(true, false)

    expect(sprite.flipX).toBe(true)
    expect(sprite.flipY).toBe(false)
  })

  it('should set frame correctly', () => {
    const sprite = new Sprite2D({ texture })
    const frame = {
      name: 'test',
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
      sourceWidth: 50,
      sourceHeight: 50,
    }

    sprite.setFrame(frame)

    expect(sprite.frame).toEqual(frame)
    expect(sprite.width).toBe(50)
    expect(sprite.height).toBe(50)
  })

  it('should set layer and zIndex', () => {
    const sprite = new Sprite2D({
      texture,
      layer: 3,
      zIndex: 100,
    })

    expect(sprite.layer).toBe(3)
    expect(sprite.zIndex).toBe(100)
  })

  it('should handle instance values', () => {
    const sprite = new Sprite2D({ texture })

    sprite.setInstanceValue('dissolve', 0.5)
    sprite.setInstanceValue('outline', [1, 0, 0])

    expect(sprite.getInstanceValue('dissolve')).toBe(0.5)
    expect(sprite.getInstanceValue('outline')).toEqual([1, 0, 0])

    sprite.clearInstanceValues()
    expect(sprite.getInstanceValue('dissolve')).toBeUndefined()
  })

  it('should clone correctly', () => {
    const sprite = new Sprite2D({
      texture,
      tint: 0xff0000,
      alpha: 0.5,
      layer: 2,
      zIndex: 10,
    })
    sprite.position.set(100, 200, 0)
    sprite.setInstanceValue('test', 42)

    const cloned = sprite.clone()

    expect(cloned.tint.equals(sprite.tint)).toBe(true)
    expect(cloned.alpha).toBe(sprite.alpha)
    expect(cloned.layer).toBe(sprite.layer)
    expect(cloned.zIndex).toBe(sprite.zIndex)
    expect(cloned.position.equals(sprite.position)).toBe(true)
    expect(cloned.getInstanceValue('test')).toBe(42)
  })

  it('should get world position 2D', () => {
    const sprite = new Sprite2D({ texture })
    sprite.position.set(100, 200, 50)

    const pos2D = sprite.getWorldPosition2D()

    expect(pos2D.x).toBe(100)
    expect(pos2D.y).toBe(200)
  })
})
