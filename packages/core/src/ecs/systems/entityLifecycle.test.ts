import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import {
  IsRenderable,
  IsBatched,
  BatchSlot,
  BatchRegistry,
  SpriteColor,
} from '../traits'
import type { RegistryData } from '../batchUtils'

// ============================================
// Helpers
// ============================================

function getRegistry(group: SpriteGroup): RegistryData | null {
  const world = group.world
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return null
  return registryEntities[0]!.get(BatchRegistry) as RegistryData
}

/** Run ECS systems (calls the deprecated but public update() method) */
function runSystems(group: SpriteGroup): void {
  group.update()
}

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 100, height: 100 }
  return texture
}

function makeSprite(texture: Texture, material: Sprite2DMaterial): Sprite2D {
  return new Sprite2D({ texture, material })
}

// ============================================
// Basic Add/Remove
// ============================================

describe('Entity Lifecycle: Basic Add/Remove', () => {
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

  it('add sprite should create entity with IsRenderable', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsRenderable)).toBe(true)
  })

  it('add sprite + run systems should assign batch slot', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    const bs = sprite.entity!.get(BatchSlot)
    expect(bs).toBeDefined()
    expect(bs!.batchIdx).toBeGreaterThanOrEqual(0)
    expect(bs!.slot).toBeGreaterThanOrEqual(0)
  })

  it('remove sprite should null entity ref', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    group.remove(sprite)
    expect(sprite.entity).toBeNull()
  })

  it('remove sprite + run systems should free batch slot', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    group.remove(sprite)
    runSystems(group)

    // Entity is destroyed, sprite count is 0
    expect(group.spriteCount).toBe(0)

    const registry = getRegistry(group)
    expect(registry).not.toBeNull()
    // Batch should be recycled (no active sprites)
    expect(registry!.activeBatches.length).toBe(0)
  })
})

// ============================================
// Add/Remove/Re-Add in Single Frame
// ============================================

describe('Entity Lifecycle: Add/Remove/Re-Add Single Frame', () => {
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

  it('add, remove, re-add before systems run: sprite should be batched', () => {
    const sprite = makeSprite(texture, material)

    group.add(sprite)
    group.remove(sprite)
    group.add(sprite)

    // Run systems once — should handle the add/remove/re-add
    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsRenderable)).toBe(true)
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    const bs = sprite.entity!.get(BatchSlot)
    expect(bs).toBeDefined()
    expect(bs!.batchIdx).toBeGreaterThanOrEqual(0)
    expect(bs!.slot).toBeGreaterThanOrEqual(0)
  })

  it('add, run, remove, re-add, run: sprite should be batched', () => {
    const sprite = makeSprite(texture, material)

    group.add(sprite)
    runSystems(group)

    // Verify first enrollment
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    // Remove and re-add
    group.remove(sprite)
    group.add(sprite)

    // Run systems — late assignment pass should catch the new entity
    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsRenderable)).toBe(true)
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    const bs = sprite.entity!.get(BatchSlot)
    expect(bs).toBeDefined()
    expect(bs!.batchIdx).toBeGreaterThanOrEqual(0)
  })

  it('re-added sprite should have correct color data in batch', () => {
    const sprite = makeSprite(texture, material)
    sprite.alpha = 0.5

    group.add(sprite)
    runSystems(group)

    group.remove(sprite)
    sprite.alpha = 0.75
    group.add(sprite)
    runSystems(group)

    // Verify the entity has the updated alpha
    const color = sprite.entity!.get(SpriteColor)
    expect(color).toBeDefined()
    expect(color!.a).toBeCloseTo(0.75)
  })
})

// ============================================
// Remove/Re-Add Single Frame
// ============================================

describe('Entity Lifecycle: Remove/Re-Add Single Frame', () => {
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

  it('remove then re-add before systems run: new entity gets batched', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    // Remove and re-add between frames
    group.remove(sprite)
    group.add(sprite)

    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsBatched)).toBe(true)
  })

  it('snapshot values preserved through remove/re-add cycle', () => {
    const sprite = makeSprite(texture, material)
    sprite.alpha = 0.3
    sprite.layer = 5

    group.add(sprite)
    runSystems(group)

    group.remove(sprite)

    // Snapshot should have serialized values
    expect(sprite._snapshot.color.a).toBeCloseTo(0.3)
    expect(sprite._snapshot.layer.layer).toBe(5)

    group.add(sprite)
    runSystems(group)

    // New entity should have the serialized values
    const color = sprite.entity!.get(SpriteColor)
    expect(color!.a).toBeCloseTo(0.3)
  })
})

// ============================================
// Multiple Cycles
// ============================================

describe('Entity Lifecycle: Multiple Cycles', () => {
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

  it('rapid remove/re-add 5 times: final state correct', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    for (let i = 0; i < 5; i++) {
      group.remove(sprite)
      group.add(sprite)
    }

    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)
  })

  it('multi-frame add/remove/re-add: each frame has correct state', () => {
    const sprite = makeSprite(texture, material)

    // Frame 1: add
    group.add(sprite)
    runSystems(group)
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    // Frame 2: remove
    group.remove(sprite)
    runSystems(group)
    expect(sprite.entity).toBeNull()
    expect(group.spriteCount).toBe(0)

    // Frame 3: re-add
    group.add(sprite)
    runSystems(group)
    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)
  })

  it('two sprites added and removed independently', () => {
    const spriteA = makeSprite(texture, material)
    const spriteB = makeSprite(texture, material)

    group.add(spriteA)
    group.add(spriteB)
    runSystems(group)

    expect(spriteA.entity!.has(IsBatched)).toBe(true)
    expect(spriteB.entity!.has(IsBatched)).toBe(true)

    // Remove A, keep B
    group.remove(spriteA)
    runSystems(group)

    expect(spriteA.entity).toBeNull()
    expect(spriteB.entity!.has(IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)

    // Re-add A
    group.add(spriteA)
    runSystems(group)

    expect(spriteA.entity!.has(IsBatched)).toBe(true)
    expect(spriteB.entity!.has(IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(2)
  })
})

// ============================================
// Effects Survive Add/Remove Cycles
// ============================================

describe('Entity Lifecycle: Effects Survive Cycles', () => {
  const DissolveLifecycle = createMaterialEffect({
    name: 'dissolve_lifecycle',
    schema: { progress: 0 },
    node: ({ inputColor }) => inputColor,
  })

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

  it('effect values preserved through unenroll/re-enroll', () => {
    const sprite = makeSprite(texture, material)
    const dissolve = new DissolveLifecycle()
    dissolve.progress = 0.7
    sprite.addEffect(dissolve)

    group.add(sprite)
    runSystems(group)

    // Effect should be in ECS trait
    const traitData = sprite.entity!.get(DissolveLifecycle._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.7)

    // Remove sprite — effect values serialized to defaults
    group.remove(sprite)
    expect(dissolve._defaults['progress']).toBeCloseTo(0.7)

    // Re-add sprite — effect should be restored
    group.add(sprite)
    runSystems(group)

    const newTraitData = sprite.entity!.get(DissolveLifecycle._trait) as Record<string, number>
    expect(newTraitData['progress']).toBeCloseTo(0.7)
  })

  it('effect modified between unenroll and re-enroll uses new value', () => {
    const sprite = makeSprite(texture, material)
    const dissolve = new DissolveLifecycle()
    dissolve.progress = 0.3
    sprite.addEffect(dissolve)

    group.add(sprite)
    runSystems(group)

    group.remove(sprite)

    // Modify effect while unenrolled — writes to snapshot
    dissolve.progress = 0.9
    expect(dissolve._defaults['progress']).toBeCloseTo(0.9)

    group.add(sprite)
    runSystems(group)

    // New entity should have the updated value
    const traitData = sprite.entity!.get(DissolveLifecycle._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.9)
  })

  it('effect entity references updated on re-enrollment', () => {
    const sprite = makeSprite(texture, material)
    const dissolve = new DissolveLifecycle()
    sprite.addEffect(dissolve)

    group.add(sprite)
    runSystems(group)

    const firstEntity = sprite.entity
    expect(dissolve._entity).toBe(firstEntity)

    group.remove(sprite)
    expect(dissolve._entity).toBeNull()

    group.add(sprite)
    runSystems(group)

    const secondEntity = sprite.entity
    expect(secondEntity).not.toBeNull()
    expect(secondEntity).not.toBe(firstEntity) // New entity
    expect(dissolve._entity).toBe(secondEntity)
  })
})

// ============================================
// Batch Slot Reuse
// ============================================

describe('Entity Lifecycle: Batch Slot Reuse', () => {
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

  it('batch recycled when all sprites removed, reused on next add', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    const registry = getRegistry(group)!
    expect(registry.activeBatches.length).toBe(1)

    group.remove(sprite)
    runSystems(group)

    // Batch should be recycled to pool
    expect(registry.activeBatches.length).toBe(0)
    expect(registry.batchPool.length).toBe(1)

    // Add a new sprite — should reuse the pooled batch
    const sprite2 = makeSprite(texture, material)
    group.add(sprite2)
    runSystems(group)

    expect(registry.activeBatches.length).toBe(1)
    // Pool should be empty now (batch was reused)
    expect(registry.batchPool.length).toBe(0)
  })

  it('freed slot reused by new sprite in same batch', () => {
    const spriteA = makeSprite(texture, material)
    const spriteB = makeSprite(texture, material)

    group.add(spriteA)
    group.add(spriteB)
    runSystems(group)

    const slotA = spriteA.entity!.get(BatchSlot)!.slot

    // Remove sprite A (frees its slot)
    group.remove(spriteA)
    runSystems(group)

    // Add sprite C — should get the freed slot
    const spriteC = makeSprite(texture, material)
    group.add(spriteC)
    runSystems(group)

    const slotC = spriteC.entity!.get(BatchSlot)!.slot
    expect(slotC).toBe(slotA) // Reused the freed slot
  })
})

// ============================================
// Material Tier Change
// ============================================

describe('Entity Lifecycle: Material Tier Change', () => {
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

  it('tier upgrade rebuilds batches and re-assigns sprites', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    expect(sprite.entity!.has(IsBatched)).toBe(true)
    const registry = getRegistry(group)!
    const initialBatchCount = registry.activeBatches.length
    expect(initialBatchCount).toBe(1)

    // Register a big effect that forces tier upgrade (8 -> 16)
    const BigEffect = createMaterialEffect({
      name: 'big_tier',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(BigEffect)
    expect(material._effectTier).toBe(16)

    // Run systems — should detect version change and rebuild batches
    runSystems(group)

    expect(sprite.entity).not.toBeNull()
    expect(sprite.entity!.has(IsBatched)).toBe(true)

    // Should still have a batch (rebuilt with correct tier)
    expect(registry.activeBatches.length).toBeGreaterThanOrEqual(1)
  })

  it('sprites preserve their data through tier change rebuild', () => {
    const sprite = makeSprite(texture, material)
    sprite.alpha = 0.5

    group.add(sprite)
    runSystems(group)

    // Register effect causing tier upgrade
    const SmallEffect = createMaterialEffect({
      name: 'small_tier',
      schema: { value: 0 },
      node: ({ inputColor }) => inputColor,
    })

    // Manually cause a tier change (8 is the default, so a small effect won't change it)
    const BigEffect = createMaterialEffect({
      name: 'big_tier2',
      schema: { a: [0, 0, 0, 0], b: [0, 0, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(BigEffect)

    runSystems(group)

    // Alpha should be preserved through the rebuild
    const color = sprite.entity!.get(SpriteColor)
    expect(color).toBeDefined()
    expect(color!.a).toBeCloseTo(0.5)
  })
})
