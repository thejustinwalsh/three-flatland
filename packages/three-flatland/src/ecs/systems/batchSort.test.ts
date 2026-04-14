import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { BatchSlot, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'

// ============================================
// Helpers
// ============================================

function getRegistry(group: SpriteGroup): RegistryData | null {
  const world = group.world
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return null
  return registryEntities[0]!.get(BatchRegistry) as RegistryData
}

function runSystems(group: SpriteGroup): void {
  group.update()
}

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 100, height: 100 }
  return texture
}

function getBatchForSprite(group: SpriteGroup, sprite: Sprite2D): SpriteBatch | null {
  const registry = getRegistry(group)
  if (!registry) return null
  const bs = sprite.entity!.get(BatchSlot)!
  return registry.batchSlots[bs.batchIdx] as SpriteBatch | null
}

function readMatrixZ(batch: SpriteBatch, slot: number): number {
  const arr = batch.instanceMatrix.array as Float32Array
  return arr[slot * 16 + 14]!
}

// ============================================
// Part 1: batchSortSystem correctness
// ============================================

describe('batchSortSystem (Option B — transparent path)', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let group: SpriteGroup

  beforeEach(() => {
    texture = makeTexture()
    // Default transparent material — CPU sort is the only correctness path.
    material = new Sprite2DMaterial({ map: texture })
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  it('sorts instance slots by zIndex ascending after a zIndex flip', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    const c = new Sprite2D({ texture, material })
    a.zIndex = 10
    b.zIndex = 5
    c.zIndex = 7

    group.add(a)
    group.add(b)
    group.add(c)
    runSystems(group)

    // After initial assignment + sort, slots in ascending order should
    // correspond to zIndex ascending: slot[0] = zIndex 5, slot[1] = 7, slot[2] = 10.
    const bs = a.entity!.get(BatchSlot)!
    const bsB = b.entity!.get(BatchSlot)!
    const bsC = c.entity!.get(BatchSlot)!

    // b (z=5) should have the lowest slot, c (z=7) next, a (z=10) last.
    expect(bsB.slot).toBeLessThan(bsC.slot)
    expect(bsC.slot).toBeLessThan(bs.slot)

    // The instance matrix Z (baked in transformSyncSystem) should also
    // order monotonically with zIndex (lower zIndex → lower matrix Z).
    const batch = getBatchForSprite(group, a)!
    expect(readMatrixZ(batch, bsB.slot)).toBeLessThan(readMatrixZ(batch, bsC.slot))
    expect(readMatrixZ(batch, bsC.slot)).toBeLessThan(readMatrixZ(batch, bs.slot))

    // Now flip a's zIndex to the lowest.
    a.zIndex = 0
    runSystems(group)

    const bs2 = a.entity!.get(BatchSlot)!
    const bsB2 = b.entity!.get(BatchSlot)!
    const bsC2 = c.entity!.get(BatchSlot)!

    // a (z=0) now has the lowest slot.
    expect(bs2.slot).toBeLessThan(bsB2.slot)
    expect(bsB2.slot).toBeLessThan(bsC2.slot)
  })

  it('does zero work when no zIndex changed this frame', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.zIndex = 1
    b.zIndex = 2
    group.add(a)
    group.add(b)
    runSystems(group)

    const batch = getBatchForSprite(group, a)!
    const swapSpy = vi.spyOn(batch, 'swapSlots')

    // Run another frame without touching zIndex.
    runSystems(group)

    expect(swapSpy).not.toHaveBeenCalled()
    swapSpy.mockRestore()
  })
})

// ============================================
// Part 2: alphaTest opt-in gate
// ============================================

describe('batchSortSystem (Option A — alphaTest opt-in)', () => {
  let texture: Texture
  let group: SpriteGroup

  beforeEach(() => {
    texture = makeTexture()
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  it('skips batches whose material has alphaTest > 0 and depthWrite', () => {
    const material = new Sprite2DMaterial({ map: texture, alphaTest: 0.5 })
    // Sanity-check: alphaTest option auto-flipped the material to opaque+depth.
    expect(material.alphaTest).toBe(0.5)
    expect(material.transparent).toBe(false)
    expect(material.depthWrite).toBe(true)

    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.zIndex = 10
    b.zIndex = 1
    group.add(a)
    group.add(b)
    runSystems(group)

    const batch = getBatchForSprite(group, a)!
    const swapSpy = vi.spyOn(batch, 'swapSlots')

    // Flip zIndex — this would normally trigger a sort on a transparent batch.
    a.zIndex = 0
    runSystems(group)

    expect(swapSpy).not.toHaveBeenCalled()
    swapSpy.mockRestore()
  })
})

// ============================================
// Part 2: Sprite2DMaterial.getShared dedup key
// ============================================

describe('Sprite2DMaterial.getShared (alphaTest in dedup key)', () => {
  let texture: Texture

  beforeEach(() => {
    texture = makeTexture()
  })

  afterEach(() => {
    universe.reset()
  })

  it('returns the same instance for identical alphaTest', () => {
    const a = Sprite2DMaterial.getShared({ map: texture, alphaTest: 0.5 })
    const b = Sprite2DMaterial.getShared({ map: texture, alphaTest: 0.5 })
    expect(a).toBe(b)
  })

  it('returns different instances for different alphaTest', () => {
    const a = Sprite2DMaterial.getShared({ map: texture, alphaTest: 0.5 })
    const b = Sprite2DMaterial.getShared({ map: texture, alphaTest: 0.25 })
    expect(a).not.toBe(b)
  })
})

// ============================================
// Part 2: matrix Z monotonicity
// ============================================

describe('transformSyncSystem — matrix Z monotonic in zIndex', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let group: SpriteGroup

  beforeEach(() => {
    texture = makeTexture()
    material = new Sprite2DMaterial({ map: texture })
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
    universe.reset()
  })

  it('bakes greater matrix Z for higher zIndex at the same layer', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.zIndex = 1
    b.zIndex = 100
    group.add(a)
    group.add(b)
    runSystems(group)

    const batch = getBatchForSprite(group, a)!
    const za = readMatrixZ(batch, a.entity!.get(BatchSlot)!.slot)
    const zb = readMatrixZ(batch, b.entity!.get(BatchSlot)!.slot)
    expect(zb).toBeGreaterThan(za)
  })
})
