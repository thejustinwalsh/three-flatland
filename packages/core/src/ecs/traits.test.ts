import { describe, it, expect, afterEach } from 'vitest'
import { createWorld, universe } from 'koota'
import { Texture } from 'three'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SpriteLayer,
  SpriteZIndex,
  SpriteMaterialRef,
  IsRenderable,
  ThreeRef,
} from './traits'

describe('ECS traits — sprite enrollment lifecycle', () => {
  let world: ReturnType<typeof createWorld>
  let texture: Texture
  let material: Sprite2DMaterial

  afterEach(() => {
    world?.destroy()
  })

  function setup() {
    world = createWorld()
    texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  }

  it('should enroll a sprite in a world and create entity', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    expect(sprite._entity).not.toBeNull()
    expect(sprite._flatlandWorld).toBe(world)
  })

  it('should set initial trait values from sprite state', () => {
    setup()
    const sprite = new Sprite2D({
      material,
      tint: 0xff0000,
      alpha: 0.5,
      layer: 3,
      zIndex: 42,
    })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    const color = entity.get(SpriteColor)
    expect(color).toBeDefined()
    expect(color!.r).toBeCloseTo(1)
    expect(color!.g).toBeCloseTo(0)
    expect(color!.b).toBeCloseTo(0)
    expect(color!.a).toBe(0.5)

    const layer = entity.get(SpriteLayer)
    expect(layer).toBeDefined()
    expect(layer!.layer).toBe(3)

    const zIdx = entity.get(SpriteZIndex)
    expect(zIdx).toBeDefined()
    expect(zIdx!.zIndex).toBe(42)
  })

  it('should set UV trait from frame data', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite.setFrame({
      name: 'test',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      sourceWidth: 30,
      sourceHeight: 40,
    })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    const uv = entity.get(SpriteUV)
    expect(uv).toBeDefined()
    expect(uv!.x).toBeCloseTo(0.1)
    expect(uv!.y).toBeCloseTo(0.2)
    expect(uv!.w).toBeCloseTo(0.3)
    expect(uv!.h).toBeCloseTo(0.4)
  })

  it('should set flip trait from initial state', () => {
    setup()
    const sprite = new Sprite2D({ material, flipX: true, flipY: false })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    const flip = entity.get(SpriteFlip)
    expect(flip).toBeDefined()
    expect(flip!.x).toBe(-1)
    expect(flip!.y).toBe(1)
  })

  it('should set material ref trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    const matRef = entity.get(SpriteMaterialRef)
    expect(matRef).toBeDefined()
    expect(matRef!.materialId).toBe(material.batchId)
  })

  it('should set ThreeRef to the sprite object', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    const ref = entity.get(ThreeRef)
    expect(ref).toBeDefined()
    expect(ref!.object).toBe(sprite)
  })

  it('should have IsRenderable tag', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    const entity = sprite._entity!
    expect(entity.has(IsRenderable)).toBe(true)
  })

  it('should not enroll twice', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)
    const entity1 = sprite._entity

    sprite._enrollInWorld(world)
    expect(sprite._entity).toBe(entity1)
  })

  it('should unenroll and destroy entity', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)
    expect(sprite._entity).not.toBeNull()

    sprite._unenrollFromWorld()
    expect(sprite._entity).toBeNull()
  })

  it('should handle unenroll when not enrolled', () => {
    setup()
    const sprite = new Sprite2D({ material })
    // Should not throw
    sprite._unenrollFromWorld()
    expect(sprite._entity).toBeNull()
  })
})

describe('ECS traits — property sync', () => {
  let world: ReturnType<typeof createWorld>
  let texture: Texture
  let material: Sprite2DMaterial

  afterEach(() => {
    world?.destroy()
  })

  function setup() {
    world = createWorld()
    texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  }

  it('should sync tint changes to SpriteColor trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.tint = 0x00ff00
    const color = sprite._entity!.get(SpriteColor)
    expect(color!.r).toBeCloseTo(0)
    expect(color!.g).toBeCloseTo(1)
    expect(color!.b).toBeCloseTo(0)
  })

  it('should sync alpha changes to SpriteColor trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.alpha = 0.3
    const color = sprite._entity!.get(SpriteColor)
    expect(color!.a).toBe(0.3)
  })

  it('should sync layer changes to SpriteLayer trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.layer = 5
    const layer = sprite._entity!.get(SpriteLayer)
    expect(layer!.layer).toBe(5)
  })

  it('should sync zIndex changes to SpriteZIndex trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.zIndex = 99
    const zIdx = sprite._entity!.get(SpriteZIndex)
    expect(zIdx!.zIndex).toBe(99)
  })

  it('should sync flipX changes to SpriteFlip trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.flipX = true
    const flip = sprite._entity!.get(SpriteFlip)
    expect(flip!.x).toBe(-1)
  })

  it('should sync flipY changes to SpriteFlip trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.flipY = true
    const flip = sprite._entity!.get(SpriteFlip)
    expect(flip!.y).toBe(-1)
  })

  it('should sync flip() method to SpriteFlip trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.flip(true, true)
    const flip = sprite._entity!.get(SpriteFlip)
    expect(flip!.x).toBe(-1)
    expect(flip!.y).toBe(-1)
  })

  it('should sync setFrame to SpriteUV trait', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.setFrame({
      name: 'walk_1',
      x: 0.25,
      y: 0.5,
      width: 0.25,
      height: 0.25,
      sourceWidth: 32,
      sourceHeight: 32,
    })

    const uv = sprite._entity!.get(SpriteUV)
    expect(uv!.x).toBeCloseTo(0.25)
    expect(uv!.y).toBeCloseTo(0.5)
    expect(uv!.w).toBeCloseTo(0.25)
    expect(uv!.h).toBeCloseTo(0.25)
  })

  it('should not write to trait when no entity exists', () => {
    setup()
    const sprite = new Sprite2D({ material })
    // No enrollment — should not throw
    sprite.tint = 0xff0000
    sprite.alpha = 0.5
    sprite.layer = 3
    sprite.zIndex = 10
    sprite.flipX = true
    sprite.flipY = true
    expect(sprite._entity).toBeNull()
  })

  it('should clean up entity on dispose', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)
    expect(sprite._entity).not.toBeNull()

    sprite.dispose()
    expect(sprite._entity).toBeNull()
  })
})

describe('ECS traits — snapshot lifecycle', () => {
  let world: ReturnType<typeof createWorld>
  let material: Sprite2DMaterial

  afterEach(() => {
    world?.destroy()
  })

  function setup() {
    world = createWorld()
    const texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  }

  it('should store pre-enrollment property changes in snapshot', () => {
    setup()
    const sprite = new Sprite2D({ material })

    sprite.tint = 0xff0000
    sprite.alpha = 0.5
    sprite.layer = 3
    sprite.zIndex = 42
    sprite.flipX = true

    expect(sprite._entity).toBeNull()
    expect(sprite._snapshot.color.r).toBeCloseTo(1)
    expect(sprite._snapshot.color.g).toBeCloseTo(0)
    expect(sprite._snapshot.color.b).toBeCloseTo(0)
    expect(sprite._snapshot.color.a).toBe(0.5)
    expect(sprite._snapshot.layer.layer).toBe(3)
    expect(sprite._snapshot.zIndex.zIndex).toBe(42)
    expect(sprite._snapshot.flip.x).toBe(-1)
  })

  it('should write to entity traits after enrollment', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite._enrollInWorld(world)

    sprite.tint = 0x00ff00
    sprite.alpha = 0.7
    sprite.layer = 5
    sprite.zIndex = 99

    const color = sprite._entity!.get(SpriteColor)
    expect(color!.r).toBeCloseTo(0)
    expect(color!.g).toBeCloseTo(1)
    expect(color!.b).toBeCloseTo(0)
    expect(color!.a).toBe(0.7)

    const layer = sprite._entity!.get(SpriteLayer)
    expect(layer!.layer).toBe(5)

    const zIdx = sprite._entity!.get(SpriteZIndex)
    expect(zIdx!.zIndex).toBe(99)
  })

  it('should preserve values in snapshot on unenrollment', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite.tint = 0xff0000
    sprite.alpha = 0.5
    sprite.layer = 3
    sprite.zIndex = 42
    sprite._enrollInWorld(world)

    // Change values while enrolled (writes to entity)
    sprite.tint = 0x00ff00
    sprite.alpha = 0.8
    sprite.layer = 7
    sprite.zIndex = 55

    // Unenroll — should serialize entity values back to snapshot
    sprite._unenrollFromWorld()
    expect(sprite._entity).toBeNull()

    expect(sprite._snapshot.color.r).toBeCloseTo(0)
    expect(sprite._snapshot.color.g).toBeCloseTo(1)
    expect(sprite._snapshot.color.b).toBeCloseTo(0)
    expect(sprite._snapshot.color.a).toBe(0.8)
    expect(sprite._snapshot.layer.layer).toBe(7)
    expect(sprite._snapshot.zIndex.zIndex).toBe(55)
  })

  it('should re-enroll from snapshot after unenrollment', () => {
    setup()
    const sprite = new Sprite2D({ material })
    sprite.tint = 0xff0000
    sprite.alpha = 0.5
    sprite.layer = 3
    sprite.zIndex = 42
    sprite._enrollInWorld(world)

    // Change values, unenroll
    sprite.tint = 0x0000ff
    sprite.layer = 9
    sprite._unenrollFromWorld()

    // Re-enroll — should spawn entity from snapshot
    sprite._enrollInWorld(world)
    expect(sprite._entity).not.toBeNull()

    const color = sprite._entity!.get(SpriteColor)
    expect(color!.r).toBeCloseTo(0)
    expect(color!.g).toBeCloseTo(0)
    expect(color!.b).toBeCloseTo(1)

    const layer = sprite._entity!.get(SpriteLayer)
    expect(layer!.layer).toBe(9)
  })

  it('should read from correct source via getters', () => {
    setup()
    const sprite = new Sprite2D({ material })

    // Pre-enrollment: getters read from snapshot
    sprite.layer = 3
    sprite.zIndex = 42
    expect(sprite.layer).toBe(3)
    expect(sprite.zIndex).toBe(42)

    // Post-enrollment: getters read from entity
    sprite._enrollInWorld(world)
    sprite.layer = 5
    expect(sprite.layer).toBe(5)

    // After unenrollment: getters read from snapshot again
    sprite._unenrollFromWorld()
    expect(sprite.layer).toBe(5)
    expect(sprite.zIndex).toBe(42)
  })

  it('should preserve flip state through enrollment lifecycle', () => {
    setup()
    const sprite = new Sprite2D({ material })

    sprite.flipX = true
    sprite.flipY = false
    expect(sprite.flipX).toBe(true)
    expect(sprite.flipY).toBe(false)

    sprite._enrollInWorld(world)
    expect(sprite.flipX).toBe(true)
    expect(sprite.flipY).toBe(false)

    sprite.flipY = true
    sprite._unenrollFromWorld()
    expect(sprite.flipX).toBe(true)
    expect(sprite.flipY).toBe(true)
  })
})
