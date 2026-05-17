import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../../materials/MaterialEffect'
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

// ============================================
// Part 3: Sort-correctness regression guards.
//
// Each test here exists to lock in a previously-broken invariant or
// catch a failure mode that's recurred during perf work. Don't delete
// without paired evidence the underlying class of bug is impossible.
// ============================================

describe('Sort correctness — regression guards', () => {
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

  // (1) swapSlots invariant — every per-instance attribute must permute
  // in lockstep. Regressions here look like "some sprites render with
  // another sprite's color/UV/effect data" after sort.
  it('swapSlots permutes ALL per-instance attributes in lockstep', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const batch = getBatchForSprite(group, a)!
    const slotA = a.entity!.get(BatchSlot)!.slot
    const slotB = b.entity!.get(BatchSlot)!.slot

    // Write distinct, identifiable data to every per-instance attribute
    // at both slots so we can verify each one was permuted.
    batch.writeColor(slotA, 0.11, 0.12, 0.13, 0.14)
    batch.writeColor(slotB, 0.21, 0.22, 0.23, 0.24)
    batch.writeUV(slotA, 0.31, 0.32, 0.33, 0.34)
    batch.writeUV(slotB, 0.41, 0.42, 0.43, 0.44)
    batch.writeFlip(slotA, -1, 1)
    batch.writeFlip(slotB, 1, -1)
    // Matrix — write a unique value at translation Z.
    const m = batch.instanceMatrix.array as Float32Array
    m[slotA * 16 + 14] = 5.5
    m[slotB * 16 + 14] = 7.7

    batch.swapSlots(slotA, slotB)

    const colorAttr = batch.getColorAttribute().array as Float32Array
    const uvAttr = batch.getUVAttribute().array as Float32Array
    const systemAttr = batch.getSystemAttribute().array as Float32Array

    // After swap: slotA holds what was at slotB, slotB holds what was
    // at slotA. Check color, UV, flip-in-system, and matrix Z.
    expect(colorAttr[slotA * 16 + 4 + 0]).toBeCloseTo(0.21)
    expect(colorAttr[slotB * 16 + 4 + 0]).toBeCloseTo(0.11)
    expect(uvAttr[slotA * 16 + 0]).toBeCloseTo(0.41)
    expect(uvAttr[slotB * 16 + 0]).toBeCloseTo(0.31)
    expect(systemAttr[slotA * 16 + 8 + 0]).toBe(1) // was slotB's flipX
    expect(systemAttr[slotB * 16 + 8 + 0]).toBe(-1) // was slotA's flipX
    expect(m[slotA * 16 + 14]).toBeCloseTo(7.7)
    expect(m[slotB * 16 + 14]).toBeCloseTo(5.5)
  })

  // (2) Y-as-zIndex pattern across multiple frames of motion. This is
  // exactly knightmark's setup and the original sprite-sort regression
  // surfaced here. Spawn 10 sprites at random Y, simulate motion for a
  // burst of frames, assert final slot order matches descending Y.
  it('keeps Y-as-zIndex sprites sorted across many frames of motion', () => {
    const sprites = Array.from({ length: 10 }, () => new Sprite2D({ texture, material }))
    for (const s of sprites) {
      s.position.y = (Math.random() - 0.5) * 200
      s.zIndex = -Math.floor(s.position.y)
      group.add(s)
    }
    runSystems(group)

    // Simulate 30 frames of motion: random Y velocity per sprite,
    // zIndex re-derived each frame.
    const velocities = sprites.map(() => (Math.random() - 0.5) * 5)
    for (let frame = 0; frame < 30; frame++) {
      sprites.forEach((s, i) => {
        s.position.y += velocities[i]!
        s.zIndex = -Math.floor(s.position.y)
      })
      runSystems(group)
    }

    // Final invariant: when sorted by slot, the sprite order should
    // match descending Y (lowest Y → lowest slot via highest zIndex…
    // wait, zIndex = -y, so lower Y gives HIGHER zIndex which sorts
    // last). Concretely: slot order ascending == zIndex ascending ==
    // Y descending. Read the actual slot→zIndex mapping and verify
    // monotonicity.
    const slotsByZIndex = sprites
      .map((s) => ({ slot: s.entity!.get(BatchSlot)!.slot, zIndex: s.zIndex }))
      .sort((a, b) => a.slot - b.slot)
    for (let i = 1; i < slotsByZIndex.length; i++) {
      expect(slotsByZIndex[i]!.zIndex).toBeGreaterThanOrEqual(slotsByZIndex[i - 1]!.zIndex)
    }
  })

  // (3) Sort + effect-bit interaction. After sort moves a sprite to a
  // new slot, the effect enable bit and effect data must follow to the
  // new slot — not stay at the old one.
  it('effect bit + data follow the sprite through a sort swap', () => {
    const Dissolve = createMaterialEffect({
      name: 'sort_dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(Dissolve)

    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.zIndex = 10
    b.zIndex = 5
    group.add(a)
    group.add(b)
    runSystems(group)

    // a (z=10) sits at the higher slot, b (z=5) at the lower.
    const aSlotBefore = a.entity!.get(BatchSlot)!.slot
    const bSlotBefore = b.entity!.get(BatchSlot)!.slot
    expect(aSlotBefore).toBeGreaterThan(bSlotBefore)

    // Add an effect to a only — its bit + data live at a's slot.
    const dissolve = new Dissolve()
    dissolve.progress = 0.42
    a.addEffect(dissolve)

    const batch = getBatchForSprite(group, a)!
    const sysArr = batch.getSystemAttribute().array as Float32Array
    const buf0 = batch.getCustomAttribute('effectBuf0')!
    const bufArr = (buf0 as unknown as { array: Float32Array }).array
    expect(sysArr[aSlotBefore * 16 + 8 + 3]).toBe(1) // enableBits at a's old slot
    expect(bufArr[aSlotBefore * 4 + 0]).toBeCloseTo(0.42) // progress at a's old slot

    // Flip zIndex so a moves below b — sort must swap their slots.
    a.zIndex = 0
    runSystems(group)

    const aSlotAfter = a.entity!.get(BatchSlot)!.slot
    const bSlotAfter = b.entity!.get(BatchSlot)!.slot
    expect(aSlotAfter).toBeLessThan(bSlotAfter)

    // Effect data + bit must now live at a's NEW slot, NOT the old one.
    expect(sysArr[aSlotAfter * 16 + 8 + 3]).toBe(1) // a's enableBits at new slot
    expect(bufArr[aSlotAfter * 4 + 0]).toBeCloseTo(0.42) // a's progress at new slot
    // And b's slot must be effect-free.
    expect(sysArr[bSlotAfter * 16 + 8 + 3]).toBe(0)
  })

  // (4) Sort + add-mid-frame. A new sprite added after an initial sort
  // lands at an arbitrary free slot; batchAssignSystem must mark sort
  // dirty so the new sprite ends up in its correct sorted position.
  it('sorts in a newly-added sprite to its correct position', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    const c = new Sprite2D({ texture, material })
    a.zIndex = 1
    b.zIndex = 5
    c.zIndex = 10
    group.add(a)
    group.add(b)
    group.add(c)
    runSystems(group)

    // Now add a fourth with mid-range zIndex.
    const d = new Sprite2D({ texture, material })
    d.zIndex = 7
    group.add(d)
    runSystems(group)

    const slots = [a, b, d, c].map((s) => s.entity!.get(BatchSlot)!.slot)
    // a(1) < b(5) < d(7) < c(10) — slot order should match zIndex order.
    expect(slots[0]).toBeLessThan(slots[1]!)
    expect(slots[1]).toBeLessThan(slots[2]!)
    expect(slots[2]).toBeLessThan(slots[3]!)
  })

  // (5) Mass-update slot stability — when zIndex order is stable across
  // frames, sort should not swap any slots after the initial pass. Guards
  // against accidentally re-sorting every frame (catastrophic at scale).
  it('does zero swaps on stable zIndex order across many frames', () => {
    const sprites = Array.from({ length: 50 }, (_, i) => {
      const s = new Sprite2D({ texture, material })
      s.zIndex = i // stable, distinct, ascending
      group.add(s)
      return s
    })
    runSystems(group) // initial sort

    const batch = getBatchForSprite(group, sprites[0]!)!
    const swapSpy = vi.spyOn(batch, 'swapSlots')

    // Run several more frames without touching zIndex.
    for (let i = 0; i < 5; i++) runSystems(group)

    expect(swapSpy).not.toHaveBeenCalled()
    swapSpy.mockRestore()
  })

  // (6) BucketedDirtyTracker correctness post-swap — after swapSlots,
  // both slots must be marked dirty on every relevant tracker so the
  // next flush uploads the new values. Test by writing values, swapping,
  // flushing, and asserting the attribute's needsUpdate fires.
  it('marks both swapped slots dirty so flush uploads the new state', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const batch = getBatchForSprite(group, a)!
    const slotA = a.entity!.get(BatchSlot)!.slot
    const slotB = b.entity!.get(BatchSlot)!.slot

    // Flush once to clear any pending state from the warmup. The
    // interleaved core attributes (getColorAttribute, etc.) are views
    // over a shared InstancedInterleavedBuffer; `needsUpdate` is a
    // SET-ONLY signal that increments the buffer's `version`. Snapshot
    // version before/after to verify the tracker fired the upload.
    batch.flushDirtyRanges()
    const colorBuf = (batch.getColorAttribute() as unknown as { data: { version: number } }).data
    const matrix = batch.instanceMatrix
    const colorVerBefore = colorBuf.version
    const matrixVerBefore = matrix.version

    batch.swapSlots(slotA, slotB)
    batch.flushDirtyRanges()

    expect(colorBuf.version).toBeGreaterThan(colorVerBefore)
    expect(matrix.version).toBeGreaterThan(matrixVerBefore)
  })
})
