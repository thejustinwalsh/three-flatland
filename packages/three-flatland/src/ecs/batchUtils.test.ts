import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { universe } from 'koota'
import { Texture } from 'three'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { BatchRegistry, BatchMesh, BatchSlot, InBatch } from './traits'
import type { RegistryData } from './batchUtils'
import type { SpriteBatch } from '../pipeline/SpriteBatch'

// ============================================
// Helpers
// ============================================

function getRegistry(group: SpriteGroup): RegistryData | null {
  const world = group.world
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return null
  return registryEntities[0]!.get(BatchRegistry) as RegistryData
}

function activeMeshes(group: SpriteGroup): SpriteBatch[] {
  const registry = getRegistry(group)!
  return registry.batchSlots.filter((m): m is SpriteBatch => m !== null)
}

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  return texture
}

// ============================================
// Auto-batch tier ladder: medium ladder, bulk-aware sizing, consolidation
// ============================================

describe('auto-batch tier defaults (batchUtils)', () => {
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

  it('small scene: 200 sprites in one pass produce exactly one 1024-slot batch', () => {
    for (let i = 0; i < 200; i++) {
      group.add(new Sprite2D({ texture, material }))
    }
    group.update()

    const meshes = activeMeshes(group)
    expect(meshes.length).toBe(1)
    expect(meshes[0]!.maxSize).toBe(1024)
    expect(meshes[0]!.activeCount).toBe(200)
  })

  it(
    'bulk prime: 40000 sprites in one pass create exactly 3 batches, all top-tier (16384)',
    () => {
      const sprites: Sprite2D[] = []
      for (let i = 0; i < 40000; i++) {
        sprites.push(new Sprite2D({ texture, material }))
      }
      for (const sprite of sprites) group.add(sprite)
      group.update()

      const meshes = activeMeshes(group)
      expect(meshes.length).toBe(3)
      for (const mesh of meshes) expect(mesh.maxSize).toBe(16384)

      const total = meshes.reduce((sum, m) => sum + m.activeCount, 0)
      expect(total).toBe(40000)
    },
    20000
  )

  it('trickle growth: adding 100 at a time up to 6000 ladders 1024 → 4096 → 16384 and consolidates the 1024 batch away', () => {
    let placed = 0
    for (let round = 0; round < 60; round++) {
      for (let i = 0; i < 100; i++) {
        group.add(new Sprite2D({ texture, material }))
        placed++
      }
      group.update()
    }
    expect(placed).toBe(6000)

    const meshes = activeMeshes(group)
    const sizes = meshes.map((m) => m.maxSize).sort((a, b) => a - b)

    // The 1024 warmup batch gets folded into the 16384 batch once the run
    // grows enough to earn a top-tier sibling — no sub-4096 batch survives.
    expect(sizes.every((s) => s >= 4096)).toBe(true)
    expect(sizes).toContain(16384)
    expect(meshes.length).toBeLessThanOrEqual(2)

    const total = meshes.reduce((sum, m) => sum + m.activeCount, 0)
    expect(total).toBe(6000)
  })

  it('explicit maxBatchSize still pins every batch to that size (no tier ladder)', () => {
    const pinned = new SpriteGroup({ maxBatchSize: 8192 })
    for (let i = 0; i < 9000; i++) {
      pinned.add(new Sprite2D({ texture, material }))
    }
    pinned.update()

    const meshes = activeMeshes(pinned)
    expect(meshes.length).toBe(2)
    for (const mesh of meshes) expect(mesh.maxSize).toBe(8192)

    pinned.dispose()
  })

  it('consolidation preserves sprite tint/UV state when migrated out of a warmup batch', () => {
    const tracked = new Sprite2D({ texture, material })
    tracked.tint.set(0.25, 0.75, 0.5)
    tracked.setFrame({
      name: 'tracked-frame',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      sourceWidth: 8,
      sourceHeight: 8,
    })
    group.add(tracked)
    group.update() // tracked alone -> a single tier-0 (1024) batch

    const oldBatchEntity = tracked.entity!.targetFor(InBatch)!
    const oldMesh = oldBatchEntity.get(BatchMesh)!.mesh!
    expect(oldMesh.maxSize).toBe(1024)

    const oldSlot = tracked.entity!.get(BatchSlot)!.slot
    const oldColor = oldMesh.getColorAttribute().array as Float32Array
    const oldUV = oldMesh.getUVAttribute().array as Float32Array
    const expectedColor = Array.from(oldColor.slice(oldSlot * 16 + 4, oldSlot * 16 + 8))
    const expectedUV = Array.from(oldUV.slice(oldSlot * 16 + 0, oldSlot * 16 + 4))

    // Bulk-prime a large influx sharing the same run — bulk-aware sizing
    // creates the new batch straight at the top tier, which triggers
    // ladder-top consolidation of the still-live 1024 warmup batch.
    for (let i = 0; i < 5000; i++) {
      group.add(new Sprite2D({ texture, material }))
    }
    group.update() // early assign creates the 16384 batch + evicts tracked; late assign re-places it

    const newBatchEntity = tracked.entity!.targetFor(InBatch)!
    expect(newBatchEntity).not.toBe(oldBatchEntity)
    const newMesh = newBatchEntity.get(BatchMesh)!.mesh!
    expect(newMesh.maxSize).toBe(16384)

    const newSlot = tracked.entity!.get(BatchSlot)!.slot
    const newColor = newMesh.getColorAttribute().array as Float32Array
    const newUV = newMesh.getUVAttribute().array as Float32Array

    expect(Array.from(newColor.slice(newSlot * 16 + 4, newSlot * 16 + 8))).toEqual(expectedColor)
    expect(Array.from(newUV.slice(newSlot * 16 + 0, newSlot * 16 + 4))).toEqual(expectedUV)

    // The old 1024 batch emptied out and was recycled — its slot in the
    // active batch-mesh index is freed, not left dangling.
    const oldBatchMesh = oldBatchEntity.get(BatchMesh)
    expect(oldBatchMesh?.mesh?.isEmpty).toBe(true)
  })
})
