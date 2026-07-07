import { describe, it, expect } from 'vitest'
import { Color, Vector2 } from 'three'
import { Light2D, isLight2D } from './Light2D'

describe('Light2D', () => {
  it('should construct with default options', () => {
    const light = new Light2D()
    expect(light.lightType).toBe('point')
    expect(light.intensity).toBe(1)
    expect(light.distance).toBe(0)
    expect(light.angle).toBe(Math.PI / 4)
    expect(light.penumbra).toBe(0)
    expect(light.decay).toBe(2)
    expect(light.enabled).toBe(true)
    expect(light.castsShadow).toBe(true)
    expect(light.importance).toBe(1)
    expect(light.color).toBeInstanceOf(Color)
    expect(light.direction).toBeInstanceOf(Vector2)
  })

  it('should accept importance in options', () => {
    const light = new Light2D({ importance: 10 })
    expect(light.importance).toBe(10)
  })

  it('should round-trip importance through getUniforms', () => {
    const light = new Light2D({ importance: 7 })
    expect(light.getUniforms().importance).toBe(7)
  })

  it('should preserve importance across clone()', () => {
    const light = new Light2D({ importance: 42 })
    const cloned = light.clone()
    expect(cloned.importance).toBe(42)
  })

  it('should default category to undefined and bucket 0', () => {
    const light = new Light2D()
    expect(light.category).toBeUndefined()
    expect(light._categoryBucket).toBe(0)
  })

  it('should cache a 0..3 bucket when category is set', () => {
    const light = new Light2D({ category: 'slime' })
    expect(light.category).toBe('slime')
    expect(light._categoryBucket).toBeGreaterThanOrEqual(0)
    expect(light._categoryBucket).toBeLessThanOrEqual(3)
  })

  it('should reuse the cached bucket for repeated category strings', () => {
    const a = new Light2D({ category: 'water' })
    const b = new Light2D({ category: 'water' })
    expect(a._categoryBucket).toBe(b._categoryBucket)
  })

  it('should update bucket when category setter is reassigned', () => {
    const light = new Light2D({ category: 'slime' })
    const first = light._categoryBucket
    light.category = 'fire'
    // fire and slime may collide (4-bucket hash), but either way the
    // bucket must still be valid 0..3 and the category field updated.
    expect(light.category).toBe('fire')
    expect(light._categoryBucket).toBeGreaterThanOrEqual(0)
    expect(light._categoryBucket).toBeLessThanOrEqual(3)
    void first
  })

  it('should round-trip category through getUniforms', () => {
    const light = new Light2D({ category: 'dust' })
    expect(light.getUniforms().category).toBe('dust')
  })

  it('should preserve category across clone()', () => {
    const light = new Light2D({ category: 'magic' })
    const cloned = light.clone()
    expect(cloned.category).toBe('magic')
    expect(cloned._categoryBucket).toBe(light._categoryBucket)
  })

  it('should construct with custom options', () => {
    const light = new Light2D({
      type: 'spot',
      color: 0xff0000,
      intensity: 2.5,
      position: [100, 200],
      direction: [1, 0],
      distance: 500,
      angle: Math.PI / 6,
      penumbra: 0.3,
      decay: 1,
    })

    expect(light.lightType).toBe('spot')
    expect(light.intensity).toBe(2.5)
    expect(light.distance).toBe(500)
    expect(light.angle).toBe(Math.PI / 6)
    expect(light.penumbra).toBe(0.3)
    expect(light.decay).toBe(1)
    expect(light.position.x).toBe(100)
    expect(light.position.y).toBe(200)
  })

  it('should accept castsShadow: false in options', () => {
    const light = new Light2D({ castsShadow: false })
    expect(light.castsShadow).toBe(false)
  })

  it('should accept castsShadow: true in options (explicit)', () => {
    const light = new Light2D({ castsShadow: true })
    expect(light.castsShadow).toBe(true)
  })

  it('should set position from array', () => {
    const light = new Light2D({ position: [50, 75] })
    expect(light.position.x).toBe(50)
    expect(light.position.y).toBe(75)
    expect(light.position.z).toBe(0)
  })

  it('should set position from Vector2', () => {
    const light = new Light2D({ position: new Vector2(30, 40) })
    expect(light.position.x).toBe(30)
    expect(light.position.y).toBe(40)
  })

  it('should normalize direction on construction', () => {
    const light = new Light2D({ direction: [3, 4] })
    const len = light.direction.length()
    expect(len).toBeCloseTo(1, 5)
  })

  it('should normalize direction on set', () => {
    const light = new Light2D()
    light.direction = [5, 0]
    expect(light.direction.x).toBeCloseTo(1)
    expect(light.direction.y).toBeCloseTo(0)
  })

  it('should set direction from array', () => {
    const light = new Light2D()
    light.direction = [0, 1]
    expect(light.direction.x).toBeCloseTo(0)
    expect(light.direction.y).toBeCloseTo(1)
  })

  it('should set direction from Vector2', () => {
    const light = new Light2D()
    light.direction = new Vector2(1, 1)
    expect(light.direction.x).toBeCloseTo(Math.SQRT1_2)
    expect(light.direction.y).toBeCloseTo(Math.SQRT1_2)
  })

  it('should get position2D as Vector2', () => {
    const light = new Light2D({ position: [10, 20] })
    const p = light.position2D
    expect(p).toBeInstanceOf(Vector2)
    expect(p.x).toBe(10)
    expect(p.y).toBe(20)
  })

  it('should set position2D from array', () => {
    const light = new Light2D()
    light.position2D = [30, 40]
    expect(light.position.x).toBe(30)
    expect(light.position.y).toBe(40)
  })

  it('should set position2D from Vector2', () => {
    const light = new Light2D()
    light.position2D = new Vector2(50, 60)
    expect(light.position.x).toBe(50)
    expect(light.position.y).toBe(60)
  })

  it('should set color from ColorRepresentation', () => {
    const light = new Light2D()
    light.color = 0xff0000
    expect(light.color.r).toBeCloseTo(1)
    expect(light.color.g).toBeCloseTo(0)
    expect(light.color.b).toBeCloseTo(0)
  })

  it('should set color from Color instance', () => {
    const light = new Light2D()
    light.color = new Color(0, 1, 0)
    expect(light.color.g).toBeCloseTo(1)
  })

  it('should get uniforms', () => {
    const light = new Light2D({
      type: 'directional',
      color: 0xffffff,
      intensity: 0.8,
      direction: [1, -1],
      castsShadow: false,
    })

    const u = light.getUniforms()
    expect(u.type).toBe('directional')
    expect(u.intensity).toBe(0.8)
    expect(u.position).toBeInstanceOf(Vector2)
    expect(u.direction).toBeInstanceOf(Vector2)
    expect(u.color).toBeInstanceOf(Color)
    expect(u.castsShadow).toBe(false)
  })

  it('should clone with all properties', () => {
    const light = new Light2D({
      type: 'spot',
      color: 0x00ff00,
      intensity: 3,
      position: [10, 20],
      direction: [0, 1],
      distance: 150,
      angle: Math.PI / 3,
      penumbra: 0.5,
      decay: 1.5,
      castsShadow: false,
    })
    light.enabled = false

    const cloned = light.clone()

    expect(cloned).not.toBe(light)
    expect(cloned.lightType).toBe('spot')
    expect(cloned.intensity).toBe(3)
    expect(cloned.position.x).toBe(10)
    expect(cloned.position.y).toBe(20)
    expect(cloned.distance).toBe(150)
    expect(cloned.angle).toBe(Math.PI / 3)
    expect(cloned.penumbra).toBe(0.5)
    expect(cloned.decay).toBe(1.5)
    expect(cloned.enabled).toBe(false)
    expect(cloned.castsShadow).toBe(false)
  })

  it('should have type "Light2D"', () => {
    const light = new Light2D()
    expect(light.type).toBe('Light2D')
  })
})

describe('isLight2D', () => {
  it('should return true for Light2D instances', () => {
    const light = new Light2D()
    expect(isLight2D(light)).toBe(true)
  })

  it('should return false for non-Light2D objects', () => {
    expect(isLight2D({})).toBe(false)
    expect(isLight2D(null)).toBe(false)
    expect(isLight2D(undefined)).toBe(false)
    expect(isLight2D(42)).toBe(false)
  })
})
