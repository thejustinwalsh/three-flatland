import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { flushUnusedMaterials, releaseMaterialIfUnused, type RegistryData } from './batchUtils'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import { registryFor } from './testUtils.type-test'

// ============================================
// Helpers
// ============================================

function getRegistry(group: SpriteGroup): RegistryData {
  return registryFor(group.world)
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
// Auto-batch tier ladder: medium ladder + bulk-aware sizing
//
// Runtime batch-to-batch sprite migration ("consolidation") was scoped
// out — rejected on frame-jitter risk. Warmup-tier batches persist for
// the run's lifetime; hand-tuned scenes (e.g. knightmark) opt out of the
// ladder entirely via an explicit `maxBatchSize`.
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

  // 60s ceiling: tearing down a 40k-sprite group is O(n) and can exceed a
  // bumped 20s hook timeout on a contended CI runner. It is the bulk-prime
  // fixture's inherent teardown cost, not a hang.
  afterEach(() => {
    group.dispose()
  }, 60000)

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

  it('bulk prime: 40000 sprites in one pass create exactly 3 batches, all top-tier (16384)', () => {
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
  }, 20000)

  it('trickle growth: adding 100 at a time up to 6000 ladders 1024 → 4096 → 16384-partial', () => {
    let placed = 0
    for (let round = 0; round < 60; round++) {
      for (let i = 0; i < 100; i++) {
        group.add(new Sprite2D({ texture, material }))
        placed++
      }
      group.update()
    }
    expect(placed).toBe(6000)

    // No consolidation — every warmup-tier batch the run ever earned is
    // still live, sized by the ladder shape alone.
    const meshes = activeMeshes(group)
    const sizes = meshes.map((m) => m.maxSize).sort((a, b) => a - b)
    expect(sizes).toEqual([1024, 4096, 16384])
    expect(meshes.length).toBe(3)

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

  it('flushes material churn with one run scan and one sprite scan', () => {
    const registry = getRegistry(group)
    const originalRunValues = registry.runs.values.bind(registry.runs)
    const originalSpriteIterator = registry.spriteArr[Symbol.iterator].bind(registry.spriteArr)
    let runScans = 0
    let spriteScans = 0

    registry.runs.values = () => {
      runScans++
      return originalRunValues()
    }
    Object.defineProperty(registry.spriteArr, Symbol.iterator, {
      configurable: true,
      value: () => {
        spriteScans++
        return originalSpriteIterator()
      },
    })

    try {
      for (let i = 0; i < 1_000; i++) {
        const transient = new Sprite2DMaterial()
        registry.materialRefs.set(transient.batchId, { material: transient, version: transient.version })
        releaseMaterialIfUnused(group.world, registry, transient)
      }

      flushUnusedMaterials(group.world, registry)

      expect(runScans).toBe(1)
      expect(spriteScans).toBe(1)
      expect(registry.materialRefs.size).toBe(0)
      expect(registry.materialReleaseCandidates.size).toBe(0)
    } finally {
      registry.runs.values = originalRunValues
      delete registry.spriteArr[Symbol.iterator]
    }
  })
})
