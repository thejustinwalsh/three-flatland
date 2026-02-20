import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture, BufferAttribute } from 'three'
import { createWorld, universe } from 'koota'
import { Sprite2D } from './Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteColor, SpriteFlip, SpriteUV, IsBatched } from '../ecs/traits'

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

  it('should clone correctly', () => {
    const sprite = new Sprite2D({
      texture,
      tint: 0xff0000,
      alpha: 0.5,
      layer: 2,
      zIndex: 10,
    })
    sprite.position.set(100, 200, 0)

    const cloned = sprite.clone()

    expect(cloned.tint.equals(sprite.tint)).toBe(true)
    expect(cloned.alpha).toBe(sprite.alpha)
    expect(cloned.layer).toBe(sprite.layer)
    expect(cloned.zIndex).toBe(sprite.zIndex)
    expect(cloned.position.equals(sprite.position)).toBe(true)
  })

  it('should get world position 2D', () => {
    const sprite = new Sprite2D({ texture })
    sprite.position.set(100, 200, 50)

    const pos2D = sprite.getWorldPosition2D()

    expect(pos2D.x).toBe(100)
    expect(pos2D.y).toBe(200)
  })
})

// ============================================
// Standalone vs Enrolled buffer behavior
// ============================================

describe('Sprite2D standalone vs enrolled', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  afterEach(() => {
    universe.reset()
  })

  it('standalone: tint writes to own geometry buffer immediately', () => {
    const sprite = new Sprite2D({ texture, material })

    sprite.tint = [1, 0, 0]

    const colorAttr = sprite.geometry.getAttribute('instanceColor') as BufferAttribute
    const array = colorAttr.array as Float32Array
    expect(array[0]).toBeCloseTo(1) // r
    expect(array[1]).toBeCloseTo(0) // g
    expect(array[2]).toBeCloseTo(0) // b
    expect(array[3]).toBeCloseTo(1) // a
  })

  it('standalone: alpha writes to own geometry buffer immediately', () => {
    const sprite = new Sprite2D({ texture, material })

    sprite.alpha = 0.5

    const colorAttr = sprite.geometry.getAttribute('instanceColor') as BufferAttribute
    const array = colorAttr.array as Float32Array
    // All 4 vertices should have alpha = 0.5
    expect(array[3]).toBeCloseTo(0.5)
    expect(array[7]).toBeCloseTo(0.5)
  })

  it('standalone: flip writes to own geometry buffer immediately', () => {
    const sprite = new Sprite2D({ texture, material })

    sprite.flipX = true

    const flipAttr = sprite.geometry.getAttribute('instanceFlip') as BufferAttribute
    const array = flipAttr.array as Float32Array
    expect(array[0]).toBe(-1) // x flipped
    expect(array[1]).toBe(1)  // y normal
  })

  it('standalone: setFrame writes to own UV buffer immediately', () => {
    const sprite = new Sprite2D({ texture, material })
    sprite.setFrame({
      name: 'test',
      x: 0.25,
      y: 0.5,
      width: 0.25,
      height: 0.25,
      sourceWidth: 25,
      sourceHeight: 25,
    })

    const uvAttr = sprite.geometry.getAttribute('instanceUV') as BufferAttribute
    const array = uvAttr.array as Float32Array
    expect(array[0]).toBeCloseTo(0.25) // x
    expect(array[1]).toBeCloseTo(0.5)  // y
    expect(array[2]).toBeCloseTo(0.25) // w
    expect(array[3]).toBeCloseTo(0.25) // h
  })

  it('enrolled: tint writes to trait only, own buffer unchanged', () => {
    const sprite = new Sprite2D({ texture, material })
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Read initial own buffer color (should be white from construction)
    const colorAttr = sprite.geometry.getAttribute('instanceColor') as BufferAttribute
    const array = colorAttr.array as Float32Array
    const initialG = array[1] // green component

    // Change tint — writes to entity trait, NOT to own buffer
    sprite.tint = [1, 0, 0]

    // Own buffer should NOT have changed
    expect(array[1]).toBe(initialG)

    // But the trait should have the new value
    expect(sprite._entity).not.toBeNull()
    const color = sprite._entity!.get(SpriteColor)
    expect(color.r).toBe(1)
    expect(color.g).toBe(0)
    expect(color.b).toBe(0)
  })

  it('enrolled: flip writes to trait only', () => {
    const sprite = new Sprite2D({ texture, material })
    const world = createWorld()
    sprite._enrollInWorld(world)

    sprite.flipX = true

    // Trait should have the new value
    const flip = sprite._entity!.get(SpriteFlip)
    expect(flip.x).toBe(-1)
    expect(flip.y).toBe(1)
  })

  it('enrolled: setFrame writes to trait only', () => {
    const sprite = new Sprite2D({ texture, material })
    const world = createWorld()
    sprite._enrollInWorld(world)

    sprite.setFrame({
      name: 'test',
      x: 0.25,
      y: 0.5,
      width: 0.25,
      height: 0.25,
      sourceWidth: 25,
      sourceHeight: 25,
    })

    const uv = sprite._entity!.get(SpriteUV)
    expect(uv.x).toBeCloseTo(0.25)
    expect(uv.y).toBeCloseTo(0.5)
    expect(uv.w).toBeCloseTo(0.25)
    expect(uv.h).toBeCloseTo(0.25)
  })

  it('_attachToBatch adds IsBatched to entity', () => {
    const sprite = new Sprite2D({ texture, material })
    const world = createWorld()
    sprite._enrollInWorld(world)

    expect(sprite._entity!.has(IsBatched)).toBe(false)

    // Create a minimal mock batch target
    const mockTarget = {
      writeColor: () => {},
      writeUV: () => {},
      writeFlip: () => {},
      writeMatrix: () => {},
      writeCustom: () => {},
      writeEffectSlot: () => {},
      getCustomBuffer: () => undefined,
      getColorAttribute: () => ({ needsUpdate: false }),
      getUVAttribute: () => ({ needsUpdate: false }),
      getFlipAttribute: () => ({ needsUpdate: false }),
      getCustomAttribute: () => undefined,
    }

    sprite._attachToBatch(mockTarget as any, 0)

    expect(sprite._entity!.has(IsBatched)).toBe(true)
  })

  it('_detachFromBatch removes IsBatched from entity', () => {
    const sprite = new Sprite2D({ texture, material })
    const world = createWorld()
    sprite._enrollInWorld(world)

    const mockTarget = {
      writeColor: () => {},
      writeUV: () => {},
      writeFlip: () => {},
      writeMatrix: () => {},
      writeCustom: () => {},
      writeEffectSlot: () => {},
      getCustomBuffer: () => undefined,
      getColorAttribute: () => ({ needsUpdate: false }),
      getUVAttribute: () => ({ needsUpdate: false }),
      getFlipAttribute: () => ({ needsUpdate: false }),
      getCustomAttribute: () => undefined,
    }

    sprite._attachToBatch(mockTarget as any, 0)
    expect(sprite._entity!.has(IsBatched)).toBe(true)

    sprite._detachFromBatch()
    expect(sprite._entity!.has(IsBatched)).toBe(false)
  })
})
