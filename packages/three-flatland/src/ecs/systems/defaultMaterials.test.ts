import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'

function getRegistry(group: SpriteGroup): RegistryData {
  const registryEntities = group.world.query(BatchRegistry)
  return registryEntities[0]!.get(BatchRegistry) as RegistryData
}

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
  return texture
}

const GlowEffect = createMaterialEffect({
  name: 'defaultMatGlow',
  schema: { intensity: 1 },
  node: ({ inputColor }) => inputColor,
})

describe('registry-scoped default materials + dispose resurrection', () => {
  let texture: Texture

  beforeEach(() => {
    texture = makeTexture()
  })

  afterEach(() => {
    universe.reset()
    vi.restoreAllMocks()
  })

  it('two groups sharing a texture hold their OWN default material instances', () => {
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()

    const spriteA = new Sprite2D({ texture })
    const spriteB = new Sprite2D({ texture })
    groupA.add(spriteA)
    groupB.add(spriteB)

    expect(spriteA.material).not.toBe(spriteB.material)
    expect(spriteA._materialWasRegistryDefault).toBe(true)
    expect(spriteB._materialWasRegistryDefault).toBe(true)

    // Effect registration on one group's default doesn't leak to the other
    spriteA.material.registerEffect(GlowEffect)
    expect(spriteA.material.hasEffect(GlowEffect)).toBe(true)
    expect(spriteB.material.hasEffect(GlowEffect)).toBe(false)

    groupA.dispose()
    groupB.dispose()
  })

  it('sprites in the same group sharing a texture share one default material (still batch)', () => {
    const group = new SpriteGroup()
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    group.add(a)
    group.add(b)

    expect(a.material).toBe(b.material)

    group.update()
    const registry = getRegistry(group)
    expect(registry.activeBatches.length).toBe(1)

    group.dispose()
  })

  it('explicit user materials pass through untouched', () => {
    const custom = new Sprite2DMaterial({ map: texture })
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ texture, material: custom })
    group.add(sprite)

    expect(sprite.material).toBe(custom)
    expect(sprite._materialWasRegistryDefault).toBe(false)

    group.dispose()
  })

  it('disposing a registry default resurrects its sprites with a fresh default', () => {
    const group = new SpriteGroup()
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    group.add(a)
    group.add(b)
    group.update()

    const registry = getRegistry(group)
    const disposedMaterial = a.material
    expect(registry.activeBatches.length).toBe(1)

    disposedMaterial.dispose()

    // Fresh default minted; both sprites re-pointed and still enrolled
    expect(a.material).not.toBe(disposedMaterial)
    expect(a.material).toBe(b.material)
    expect(a._materialWasRegistryDefault).toBe(true)
    expect(a.entity).not.toBeNull()
    expect(b.entity).not.toBeNull()

    // Next system pass re-batches with the fresh material
    group.update()
    expect(registry.activeBatches.length).toBe(1)
    expect(a._batchMesh).not.toBeNull()
    expect(a._batchMesh!.spriteMaterial).toBe(a.material)

    group.dispose()
  })

  it('disposing a user-supplied custom material orphans with a warning (three semantics)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const custom = new Sprite2DMaterial({ map: texture })
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ texture, material: custom })
    group.add(sprite)
    group.update()
    expect(sprite._batchMesh).not.toBeNull()

    custom.dispose()

    expect(sprite.visible).toBe(true)
    expect(sprite.entity).toBeNull() // unenrolled — three's standard semantics apply
    expect(sprite.material).toBe(custom) // we never swap user materials
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disposed material'))

    group.dispose()
  })

  it('group disposal detaches its material dispose hooks (no world leak)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const custom = new Sprite2DMaterial({ map: texture })
    const group = new SpriteGroup()
    group.add(new Sprite2D({ texture, material: custom }))
    group.update()

    group.dispose()

    // Disposing the material after the group is gone must not fire the
    // dead world's teardown handler.
    custom.dispose()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('disposed material'))
  })

  it('bootstrap texture-setter never mutates the shared bootstrap material', () => {
    const spriteA = new Sprite2D({ texture })
    const bootstrap = spriteA.material

    const otherTexture = makeTexture()
    const spriteB = new Sprite2D({ texture })
    spriteB.texture = otherTexture

    // A's shared bootstrap material still has the original texture
    expect(bootstrap.getTexture()).toBe(texture)
    expect(spriteB.material).not.toBe(bootstrap)
    expect(spriteB.material.getTexture()).toBe(otherTexture)
  })
})
