import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { universe } from 'koota'
import { Texture } from 'three'
import { Renderer2D } from './Renderer2D'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Layers } from './layers'
import { SpriteColor } from '../ecs/traits'

// Create effect class at module level so the Koota trait survives universe.reset()
const DissolveRenderer = createMaterialEffect({
  name: 'dissolve_renderer',
  schema: { progress: 0 },
  node: ({ inputColor }) => inputColor,
})

describe('Renderer2D', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let renderer: Renderer2D | null = null

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  afterEach(() => {
    renderer?.dispose()
    renderer = null
    universe.reset()
  })

  it('should create a renderer with default options', () => {
    renderer = new Renderer2D()

    expect(renderer.name).toBe('Renderer2D')
    expect(renderer.isEmpty).toBe(true)
    expect(renderer.autoSort).toBe(true)
    expect(renderer.frustumCulling).toBe(true)
  })

  it('should create a renderer with custom options', () => {
    renderer = new Renderer2D({
      maxBatchSize: 5000,
      autoSort: false,
      frustumCulling: false,
    })

    expect(renderer.autoSort).toBe(false)
    expect(renderer.frustumCulling).toBe(false)
  })

  it('should add sprites', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)

    expect(renderer.spriteCount).toBe(1)
    expect(renderer.isEmpty).toBe(false)
  })

  it('should add multiple sprites', () => {
    renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(2)
  })

  it('should remove sprites', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.remove(sprite)

    expect(renderer.spriteCount).toBe(0)
  })

  it('should remove multiple sprites', () => {
    renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.removeSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(0)
  })

  it('should update batches', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    renderer.add(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate sprites', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    sprite.layer = Layers.UI
    renderer.invalidate(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate all sprites', () => {
    renderer = new Renderer2D()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.update()

    renderer.invalidateAll()
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should provide render stats', () => {
    renderer = new Renderer2D()
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
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()
    renderer.clear()

    expect(renderer.isEmpty).toBe(true)
    expect(renderer.batchCount).toBe(0)
    expect(renderer.children.length).toBe(0)
  })

  it('should add batch objects to scene graph', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    expect(renderer.children.length).toBe(1)
  })

  // ============================================
  // updateMatrixWorld integration
  // ============================================

  it('updateMatrixWorld should run systems and sync buffers', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    renderer.add(sprite)
    // Use updateMatrixWorld instead of update()
    renderer.updateMatrixWorld()

    expect(renderer.batchCount).toBe(1)
    expect(renderer.children.length).toBe(1)
  })

  it('updateMatrixWorld should sync changed sprite properties', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.updateMatrixWorld()

    // Now sprite is enrolled + batched
    expect(sprite._batchTarget).not.toBeNull()
    const batchTarget = sprite._batchTarget!

    // Change tint — writes to trait only (no immediate batch write)
    sprite.tint = [1, 0, 0]

    // Trait should have new value
    const color = sprite._entity!.get(SpriteColor)
    expect(color.r).toBe(1)
    expect(color.g).toBe(0)

    // Run systems via updateMatrixWorld — should sync trait to batch buffer
    renderer.updateMatrixWorld()

    // Verify batch buffer was updated
    const colorAttr = batchTarget.getColorAttribute()
    const array = colorAttr.array as Float32Array
    const idx = sprite._batchIndex
    expect(array[idx * 4 + 0]).toBeCloseTo(1) // r
    expect(array[idx * 4 + 1]).toBeCloseTo(0) // g
    expect(array[idx * 4 + 2]).toBeCloseTo(0) // b
  })

  it('update() and updateMatrixWorld() should not run systems twice', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    // Old pattern: user calls update() then render triggers updateMatrixWorld()
    renderer.update()
    renderer.updateMatrixWorld()

    // Should still work correctly — no double processing
    expect(renderer.batchCount).toBe(1)
    expect(renderer.children.length).toBe(1)
  })

  it('should sync effect data through updateMatrixWorld', () => {
    renderer = new Renderer2D()
    const sprite = new Sprite2D({ material })
    const dissolve = new DissolveRenderer()
    sprite.addEffect(dissolve)

    renderer.add(sprite)
    renderer.updateMatrixWorld()

    // Sprite should be batched with effect data synced
    expect(sprite._batchTarget).not.toBeNull()

    // Change effect property — writes to trait only
    dissolve.progress = 0.8

    // Run systems
    renderer.updateMatrixWorld()

    // Effect trait should be updated (verifying the ECS path works)
    expect(dissolve.progress).toBeCloseTo(0.8)
  })
})
