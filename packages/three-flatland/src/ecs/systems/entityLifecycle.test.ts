import { worldFor, entityFor, traitFor } from '../testUtils.type-test'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Matrix4, Texture } from 'three'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { SpriteBatch } from '../../pipeline/SpriteBatch'
import { IsRenderable, IsBatched, BatchMesh, BatchSlot, SpriteColor } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { World } from '../runtime'
import { batchEntityFor, readRequired, registryFor, requiredEntity } from '../testUtils.type-test'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

// ============================================
// Helpers
// ============================================

function getRegistry(group: SpriteGroup): RegistryData {
  return registryFor(worldFor(group))
}

function has(group: SpriteGroup, sprite: Sprite2D, trait: typeof IsRenderable | typeof IsBatched): boolean {
  return worldFor(group).has(requiredEntity(sprite), trait)
}

function slot(group: SpriteGroup, sprite: Sprite2D) {
  return readRequired(worldFor(group), requiredEntity(sprite), BatchSlot)
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
  })

  it('add sprite should create entity with IsRenderable', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsRenderable)).toBe(true)
  })

  it('add sprite + run systems should assign batch slot', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsBatched)).toBe(true)

    const bs = slot(group, sprite)
    expect(bs.batchEntity).toBeGreaterThan(0)
    expect(batchEntityFor(worldFor(group), sprite)).toBe(bs.batchEntity)
    expect(bs.batchIdx).toBeGreaterThanOrEqual(0)
    expect(bs.slot).toBeGreaterThanOrEqual(0)
  })

  it('remove sprite should null entity ref', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    group.remove(sprite)
    expect(entityFor(sprite)).toBeNull()
  })

  it('destroys a sprite removed before its first batch assignment', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    const removedEntity = requiredEntity(sprite)

    group.remove(sprite)
    runSystems(group)
    runSystems(group)

    expect(worldFor(group).isAlive(removedEntity)).toBe(false)
  })

  it('does not assign a sprite removed reentrantly by updateMatrix', () => {
    const sprite = makeSprite(texture, material)
    const updateMatrix = sprite.updateMatrix.bind(sprite)
    let removeDuringUpdate = true
    sprite.updateMatrix = () => {
      updateMatrix()
      if (removeDuringUpdate) {
        removeDuringUpdate = false
        group.remove(sprite)
      }
    }
    group.add(sprite)
    const removedEntity = requiredEntity(sprite)

    runSystems(group)
    expect(entityFor(sprite)).toBeNull()
    expect(sprite._batchMesh).toBeNull()
    expect(getRegistry(group).activeBatches).toHaveLength(0)

    runSystems(group)
    expect(worldFor(group).isAlive(removedEntity)).toBe(true)
    runSystems(group)
    expect(worldFor(group).isAlive(removedEntity)).toBe(false)
  })

  it.each(['remove', 'dispose'] as const)(
    'hides a directly owned row when updateMatrix reentrantly %ss its sprite',
    (action) => {
      const sprite = makeSprite(texture, material)
      group.add(sprite)
      runSystems(group)

      const batch = sprite._batchMesh!
      const batchOwnership = getSpriteBatchOwnership(batch)
      const batchSlot = sprite._batchSlot
      const owner = requiredEntity(sprite)
      const updateMatrix = sprite.updateMatrix.bind(sprite)
      let releaseDuringUpdate = true
      sprite.updateMatrix = () => {
        updateMatrix()
        if (!releaseDuringUpdate) return
        releaseDuringUpdate = false
        if (action === 'remove') group.remove(sprite)
        else sprite.dispose()
      }

      sprite.position.x = 12
      runSystems(group)

      expect(entityFor(sprite)).toBeNull()
      expect(batchOwnership.slotEntities[batchSlot]).toBe(owner)
      expect(
        Array.from((batch.instanceMatrix.array as Float32Array).slice(batchSlot * 16, batchSlot * 16 + 16))
      ).toEqual(Array(16).fill(0))
      expect((batch.getColorAttribute().array as Float32Array)[batchSlot * 16 + 4 + 3]).toBe(0)
      expect(batch.grid.size).toBe(0)

      runSystems(group)
      expect(batchOwnership.slotEntities[batchSlot]).toBe(0)
    }
  )

  it('does not hide a replacement row installed reentrantly by updateMatrix', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    const batch = sprite._batchMesh!
    const ownership = getSpriteBatchOwnership(batch)
    const slot = sprite._batchSlot
    const owner = requiredEntity(sprite)
    const replacementOwner = Number(owner) + 100_000
    const replacement = makeSprite(texture, material)
    const replacementMatrix = new Matrix4().makeTranslation(77, 88, 0)
    const updateMatrix = sprite.updateMatrix.bind(sprite)
    let replaceDuringUpdate = true
    sprite.updateMatrix = () => {
      updateMatrix()
      if (!replaceDuringUpdate) return
      replaceDuringUpdate = false
      ownership.releaseSlot(slot, owner)
      expect(ownership.reserveSlot()).toBe(slot)
      ownership.commitSlot(slot, replacementOwner, replacement)
      batch.writeMatrix(slot, replacementMatrix)
      batch.writeColor(slot, 1, 1, 1, 1)
    }

    sprite.position.x = 12
    runSystems(group)

    expect(ownership.slotEntities[slot]).toBe(replacementOwner)
    expect(ownership.spriteAtSlot(slot)).toBe(replacement)
    expect(Array.from((batch.instanceMatrix.array as Float32Array).slice(slot * 16, slot * 16 + 16))).toEqual(
      replacementMatrix.elements
    )
    expect((batch.getColorAttribute().array as Float32Array)[slot * 16 + 4 + 3]).toBe(1)

    // Restore the deliberately forged internal row so normal group teardown
    // sees the same ownership the ECS still records for the original sprite.
    ownership.releaseSlot(slot, replacementOwner)
    expect(ownership.reserveSlot()).toBe(slot)
    ownership.commitSlot(slot, owner, sprite)
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

  it('releases unique material references while retaining a still-live shared material', () => {
    const shared = makeSprite(texture, material)
    group.add(shared)
    runSystems(group)
    const registry = getRegistry(group)

    for (let index = 0; index < 4; index++) {
      const uniqueMaterial = new Sprite2DMaterial({ map: texture })
      const removeHook = vi.spyOn(uniqueMaterial, '_removePreDisposeHook')
      const transient = makeSprite(texture, uniqueMaterial)
      group.add(transient)
      runSystems(group)
      expect(registry.materialRefs.get(uniqueMaterial.batchId)?.material).toBe(uniqueMaterial)

      group.remove(transient)
      runSystems(group)
      runSystems(group)
      expect(registry.materialRefs.has(uniqueMaterial.batchId)).toBe(false)
      expect(removeHook).toHaveBeenCalledWith(expect.any(Function))
    }

    expect(registry.materialRefs.get(material.batchId)?.material).toBe(material)
    expect(entityFor(shared)).not.toBeNull()
  })

  it('releases a superseded material that never reaches a batch', () => {
    const first = new Sprite2DMaterial({ map: texture })
    const skipped = new Sprite2DMaterial({ map: texture })
    const final = new Sprite2DMaterial({ map: texture })
    const skippedHook = vi.spyOn(skipped, '_removePreDisposeHook')
    const sprite = makeSprite(texture, first)
    group.add(sprite)
    runSystems(group)
    const registry = getRegistry(group)

    sprite.material = skipped
    sprite.material = final

    // Cleanup is intentionally batched into the schedule finalizer so rapid
    // material churn performs one registry liveness sweep per frame.
    expect(registry.materialReleaseCandidates.has(skipped.batchId)).toBe(true)

    runSystems(group)
    expect(registry.materialRefs.has(skipped.batchId)).toBe(false)
    expect(skippedHook).toHaveBeenCalledWith(expect.any(Function))
    expect(registry.materialRefs.has(first.batchId)).toBe(false)
    expect(registry.materialRefs.get(final.batchId)?.material).toBe(final)

    group.remove(sprite)
    runSystems(group)
    runSystems(group)
    expect(registry.materialRefs.has(final.batchId)).toBe(false)
  })

  it('flushes failed assignment candidates and retries the live sprite', () => {
    const failedMaterial = new Sprite2DMaterial({ map: texture })
    const removeHook = vi.spyOn(failedMaterial, '_removePreDisposeHook')
    const writeColor = vi.spyOn(SpriteBatch.prototype, 'writeColor').mockImplementationOnce(() => {
      throw new Error('projection failed')
    })
    const sprite = makeSprite(texture, failedMaterial)
    group.add(sprite)

    expect(() => runSystems(group)).toThrow('projection failed')

    const registry = getRegistry(group)
    expect(registry.runs.size).toBe(0)
    expect(registry.materialRefs.get(failedMaterial.batchId)?.material).toBe(failedMaterial)
    expect(registry.materialReleaseCandidates.size).toBe(0)
    writeColor.mockRestore()

    runSystems(group)
    expect(sprite._batchMesh).not.toBeNull()
    expect(worldFor(group).has(requiredEntity(sprite), IsBatched)).toBe(true)

    group.remove(sprite)
    runSystems(group)
    runSystems(group)
    expect(registry.materialRefs.has(failedMaterial.batchId)).toBe(false)
    expect(removeHook).toHaveBeenCalledWith(expect.any(Function))
  })

  it('scrubs an interior physical row and grid projection after failed assignment', () => {
    group.maxBatchSize = 3
    const first = makeSprite(texture, material)
    const removed = makeSprite(texture, material)
    const last = makeSprite(texture, material)
    group.add(first, removed, last)
    runSystems(group)

    const batch = first._batchMesh!
    const ownership = getSpriteBatchOwnership(batch)
    const interior = removed._batchSlot
    group.remove(removed)
    runSystems(group)
    expect(ownership.slotEntities[interior]).toBe(0)
    expect(batch.grid.size).toBe(2)

    const writeSystemFlags = vi.spyOn(SpriteBatch.prototype, 'writeSystemFlags').mockImplementationOnce(() => {
      throw new Error('late assignment projection failed')
    })
    const failed = makeSprite(texture, material)
    group.add(failed)

    expect(() => runSystems(group)).toThrow('late assignment projection failed')
    expect(ownership.slotEntities[interior]).toBe(0)
    expect(Array.from((batch.instanceMatrix.array as Float32Array).slice(interior * 16, interior * 16 + 16))).toEqual(
      Array(16).fill(0)
    )
    expect((batch.getColorAttribute().array as Float32Array)[interior * 16 + 4 + 3]).toBe(0)
    expect(batch.grid.size).toBe(2)

    writeSystemFlags.mockRestore()
    runSystems(group)
    expect(failed._batchMesh).toBe(batch)
    expect(failed._batchSlot).toBe(interior)
    expect(batch.grid.size).toBe(3)
  })

  it('retries an initial assignment after updateMatrix throws transiently', () => {
    const sprite = makeSprite(texture, material)
    const updateMatrix = vi.spyOn(sprite, 'updateMatrix').mockImplementationOnce(() => {
      throw new Error('matrix projection failed')
    })
    group.add(sprite)

    expect(() => runSystems(group)).toThrow('matrix projection failed')
    expect(entityFor(sprite)).not.toBeNull()
    expect(sprite._batchMesh).toBeNull()

    updateMatrix.mockRestore()
    runSystems(group)
    expect(sprite._batchMesh).not.toBeNull()
    expect(worldFor(group).has(requiredEntity(sprite), IsBatched)).toBe(true)
  })

  it('requeues the untouched assignment tail after the first sprite throws transiently', () => {
    const sprites = [makeSprite(texture, material), makeSprite(texture, material), makeSprite(texture, material)]
    const updateMatrix = vi.spyOn(sprites[0]!, 'updateMatrix').mockImplementationOnce(() => {
      throw new Error('first projection failed')
    })
    group.add(...sprites)

    expect(() => runSystems(group)).toThrow('first projection failed')
    expect(sprites.every((sprite) => sprite._batchMesh === null)).toBe(true)

    updateMatrix.mockRestore()
    runSystems(group)
    for (const sprite of sprites) {
      expect(sprite._batchMesh).not.toBeNull()
      expect(worldFor(group).has(requiredEntity(sprite), IsBatched)).toBe(true)
    }
  })

  it('publishes a committed material run when a later material assignment fails', () => {
    const secondMaterial = new Sprite2DMaterial({ map: texture })
    const first = makeSprite(texture, material)
    const second = makeSprite(texture, secondMaterial)
    const originalWriteSystemFlags = SpriteBatch.prototype.writeSystemFlags
    let projectionCount = 0
    const writeSystemFlags = vi
      .spyOn(SpriteBatch.prototype, 'writeSystemFlags')
      .mockImplementation(function (index, flags) {
        projectionCount++
        if (projectionCount === 2) throw new Error('second material projection failed')
        originalWriteSystemFlags.call(this, index, flags)
      })
    group.add(first, second)

    expect(() => runSystems(group)).toThrow('second material projection failed')

    const firstBatch = first._batchMesh
    expect(firstBatch).not.toBeNull()
    expect(firstBatch!.material).toBe(material)
    expect(firstBatch!.activeCount).toBe(1)
    expect(firstBatch!.count).toBe(1)
    expect(second._batchMesh).toBeNull()
    expect(getRegistry(group).transformsDirty).toBe(true)

    writeSystemFlags.mockRestore()
    runSystems(group)

    expect(first._batchMesh).toBe(firstBatch)
    expect(firstBatch!.activeCount).toBe(1)
    expect(firstBatch!.count).toBe(1)
    expect(second._batchMesh).not.toBeNull()
    expect(second._batchMesh).not.toBe(firstBatch)
    expect(second._batchMesh!.material).toBe(secondMaterial)
    expect(second._batchMesh!.activeCount).toBe(1)
    expect(second._batchMesh!.count).toBe(1)
    expect(worldFor(group).has(requiredEntity(first), IsBatched)).toBe(true)
    expect(worldFor(group).has(requiredEntity(second), IsBatched)).toBe(true)
  })

  it('does not rerun transform, sort, or scene sync for a missing late assignment', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    const internal = group as unknown as {
      _world: World
      _batchSortSystem: (world: World) => void
      _sceneGraphSyncSystem: (world: World, ...args: unknown[]) => void
    }
    const batchSort = vi.spyOn(internal, '_batchSortSystem')
    const sceneGraphSync = vi.spyOn(internal, '_sceneGraphSyncSystem')
    const originalUpdateMatrix = sprite.updateMatrix.bind(sprite)
    let injectMissingEntity = true
    const updateMatrix = vi.spyOn(sprite, 'updateMatrix').mockImplementation(() => {
      originalUpdateMatrix()
      if (!injectMissingEntity) return
      injectMissingEntity = false
      internal._world.spawn(IsRenderable)
    })

    runSystems(group)

    // The regular pass still runs each system once. Draining an Added event
    // with no sprite registry row must not claim a committed assignment and
    // wake the late transform/sort/scene pass a second time.
    expect(updateMatrix).toHaveBeenCalledTimes(1)
    expect(batchSort).toHaveBeenCalledTimes(1)
    expect(sceneGraphSync).toHaveBeenCalledTimes(1)

    updateMatrix.mockRestore()
    batchSort.mockRestore()
    sceneGraphSync.mockRestore()
  })

  it('requeues the current assignment once when batch lookup throws before its local transaction', () => {
    const sprites = [makeSprite(texture, material), makeSprite(texture, material)]
    const world = worldFor(group)!
    const originalRead = world.read.bind(world) as World['read']
    let batchMeshReads = 0
    const read = vi.spyOn(world, 'read').mockImplementation((entity, trait) => {
      const value = originalRead(entity, trait)
      if (trait === BatchMesh && ++batchMeshReads === 2) return undefined
      return value
    })
    group.add(...sprites)

    expect(() => runSystems(group)).toThrow('Published batch is missing its mesh')
    expect(sprites.every((sprite) => sprite._batchMesh === null)).toBe(true)

    read.mockRestore()
    const writeColor = vi.spyOn(SpriteBatch.prototype, 'writeColor')
    runSystems(group)
    expect(writeColor).toHaveBeenCalledTimes(2)
    expect(sprites.every((sprite) => sprite._batchMesh !== null)).toBe(true)

    writeColor.mockClear()
    runSystems(group)
    expect(writeColor).not.toHaveBeenCalled()
    writeColor.mockRestore()
  })

  it('removes an unpublished run and retries after batch construction fails', () => {
    const sprite = makeSprite(texture, material)
    const registry = getRegistry(group)
    registry.tierLadder = null
    registry.maxBatchSize = 0
    group.add(sprite)

    expect(() => runSystems(group)).toThrow(/positive safe integer/)
    expect(registry.runs.size).toBe(0)
    expect(registry.sortedRunKeys).toEqual([])
    expect(registry.activeBatches).toEqual([])
    expect(registry.batchPool).toEqual([])
    expect(registry.batchSlots).toEqual([])
    expect(entityFor(sprite)).not.toBeNull()
    expect(sprite._batchMesh).toBeNull()

    registry.maxBatchSize = 4
    runSystems(group)
    expect(sprite._batchMesh).not.toBeNull()
    expect(worldFor(group).has(requiredEntity(sprite), IsBatched)).toBe(true)
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
  })

  it('add, remove, re-add before systems run: sprite should be batched', () => {
    const sprite = makeSprite(texture, material)

    group.add(sprite)
    const removedEntity = requiredEntity(sprite)
    group.remove(sprite)
    group.add(sprite)
    const replacementEntity = requiredEntity(sprite)

    // Run systems once — should handle the add/remove/re-add
    runSystems(group)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsRenderable)).toBe(true)
    expect(has(group, sprite, IsBatched)).toBe(true)

    const bs = slot(group, sprite)
    expect(bs.batchEntity).toBeGreaterThan(0)
    expect(bs.batchIdx).toBeGreaterThanOrEqual(0)
    expect(bs.slot).toBeGreaterThanOrEqual(0)

    // The removed generation is retired on the next deferred-destroy pass;
    // the replacement packed handle remains live.
    runSystems(group)
    expect(worldFor(group).isAlive(removedEntity)).toBe(false)
    expect(worldFor(group).isAlive(replacementEntity)).toBe(true)
  })

  it('add, run, remove, re-add, run: sprite should be batched', () => {
    const sprite = makeSprite(texture, material)

    group.add(sprite)
    runSystems(group)

    // Verify first enrollment
    expect(has(group, sprite, IsBatched)).toBe(true)

    // Remove and re-add
    group.remove(sprite)
    group.add(sprite)

    // Run systems — late assignment pass should catch the new entity
    runSystems(group)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsRenderable)).toBe(true)
    expect(has(group, sprite, IsBatched)).toBe(true)

    const bs = slot(group, sprite)
    expect(bs.batchEntity).toBeGreaterThan(0)
    expect(bs.batchIdx).toBeGreaterThanOrEqual(0)
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
    const color = readRequired(worldFor(group), requiredEntity(sprite), SpriteColor)
    expect(color.a).toBeCloseTo(0.75)
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
  })

  it('remove then re-add before systems run: new entity gets batched', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    // Remove and re-add between frames
    group.remove(sprite)
    group.add(sprite)

    runSystems(group)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsBatched)).toBe(true)
  })

  it('snapshot values preserved through remove/re-add cycle', () => {
    const sprite = makeSprite(texture, material)
    sprite.alpha = 0.3
    sprite.layer = 5

    group.add(sprite)
    runSystems(group)

    group.remove(sprite)

    // Local arrays should have serialized values
    expect(sprite.alpha).toBeCloseTo(0.3)
    expect(sprite.layer).toBe(5)

    group.add(sprite)
    runSystems(group)

    // New entity should have the serialized values
    const color = readRequired(worldFor(group), requiredEntity(sprite), SpriteColor)
    expect(color.a).toBeCloseTo(0.3)
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

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)
  })

  it('multi-frame add/remove/re-add: each frame has correct state', () => {
    const sprite = makeSprite(texture, material)

    // Frame 1: add
    group.add(sprite)
    runSystems(group)
    expect(has(group, sprite, IsBatched)).toBe(true)

    // Frame 2: remove
    group.remove(sprite)
    runSystems(group)
    expect(entityFor(sprite)).toBeNull()
    expect(group.spriteCount).toBe(0)

    // Frame 3: re-add
    group.add(sprite)
    runSystems(group)
    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)
  })

  it('two sprites added and removed independently', () => {
    const spriteA = makeSprite(texture, material)
    const spriteB = makeSprite(texture, material)

    group.add(spriteA)
    group.add(spriteB)
    runSystems(group)

    expect(has(group, spriteA, IsBatched)).toBe(true)
    expect(has(group, spriteB, IsBatched)).toBe(true)

    // Remove A, keep B
    group.remove(spriteA)
    runSystems(group)

    expect(entityFor(spriteA)).toBeNull()
    expect(has(group, spriteB, IsBatched)).toBe(true)
    expect(group.spriteCount).toBe(1)

    // Re-add A
    group.add(spriteA)
    runSystems(group)

    expect(has(group, spriteA, IsBatched)).toBe(true)
    expect(has(group, spriteB, IsBatched)).toBe(true)
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
    material.registerEffect(DissolveLifecycle)
    group = new SpriteGroup()
  })

  afterEach(() => {
    group.dispose()
  })

  it('effect values preserved through unenroll/re-enroll', () => {
    const sprite = makeSprite(texture, material)
    const dissolve = new DissolveLifecycle()
    dissolve.progress = 0.7
    sprite.addEffect(dissolve)

    group.add(sprite)
    runSystems(group)

    // Effect should be in ECS trait
    const traitData = worldFor(group).read(requiredEntity(sprite), traitFor(DissolveLifecycle)) as Record<
      string,
      number
    >
    expect(traitData['progress']).toBeCloseTo(0.7)

    // Remove sprite — effect values serialized to defaults
    group.remove(sprite)
    expect(dissolve._defaults['progress']).toBeCloseTo(0.7)

    // Re-add sprite — effect should be restored
    group.add(sprite)
    runSystems(group)

    const newTraitData = worldFor(group).read(requiredEntity(sprite), traitFor(DissolveLifecycle)) as Record<
      string,
      number
    >
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
    const traitData = worldFor(group).read(requiredEntity(sprite), traitFor(DissolveLifecycle)) as Record<
      string,
      number
    >
    expect(traitData['progress']).toBeCloseTo(0.9)
  })

  it('effect entity references updated on re-enrollment', () => {
    const sprite = makeSprite(texture, material)
    const dissolve = new DissolveLifecycle()
    sprite.addEffect(dissolve)

    group.add(sprite)
    runSystems(group)

    const firstEntity = entityFor(sprite)
    expect(entityFor(dissolve)).toBe(firstEntity)

    group.remove(sprite)
    expect(entityFor(dissolve)).toBeNull()

    group.add(sprite)
    runSystems(group)

    const secondEntity = entityFor(sprite)
    expect(secondEntity).not.toBeNull()
    expect(secondEntity).not.toBe(firstEntity) // New entity
    expect(entityFor(dissolve)).toBe(secondEntity)
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

  it('never restores a disposed pooled mesh when replacement disposal throws', () => {
    group.maxBatchSize = 1
    const first = makeSprite(texture, material)
    group.add(first)
    runSystems(group)

    const registry = getRegistry(group)
    const pooledEntity = registry.activeBatches[0]!
    const pooledMesh = first._batchMesh!
    group.remove(first)
    runSystems(group)
    expect(registry.batchPool).toEqual([pooledEntity])

    const disposeListener = vi.fn().mockImplementationOnce(() => {
      throw new Error('pooled geometry listener failed')
    })
    pooledMesh.geometry.addEventListener('dispose', disposeListener)
    const replacementMaterial = new Sprite2DMaterial({ map: texture })
    const replacement = makeSprite(texture, replacementMaterial)
    group.add(replacement)

    expect(() => runSystems(group)).toThrow('pooled geometry listener failed')
    expect(registry.batchPool).toEqual([])
    expect(registry.activeBatches).toEqual([pooledEntity])
    expect(registry.runs.size).toBe(1)
    const publishedMesh = readRequired(worldFor(group), pooledEntity, BatchMesh).mesh!
    expect(publishedMesh).not.toBe(pooledMesh)
    expect(worldFor(group).isAlive(pooledEntity)).toBe(true)

    pooledMesh.geometry.removeEventListener('dispose', disposeListener)
    runSystems(group)
    expect(registry.batchPool).toEqual([])
    expect(registry.activeBatches).toHaveLength(1)
    expect(replacement._batchMesh).toBe(publishedMesh)

    group.remove(replacement)
    runSystems(group)
    const oldRoute = makeSprite(texture, material)
    group.add(oldRoute)
    runSystems(group)
    expect(oldRoute._batchMesh).not.toBe(pooledMesh)
  })

  it('does not resurrect a pool entry when replacement disposal clears the group', () => {
    group.maxBatchSize = 1
    const first = makeSprite(texture, material)
    group.add(first)
    runSystems(group)

    const registry = getRegistry(group)
    const pooledMesh = first._batchMesh!
    group.remove(first)
    runSystems(group)
    expect(registry.batchPool).toHaveLength(1)

    pooledMesh.geometry.addEventListener(
      'dispose',
      vi.fn(() => group.clear())
    )
    const replacement = makeSprite(texture, new Sprite2DMaterial({ map: texture }))
    group.add(replacement)

    expect(() => runSystems(group)).toThrow(/Batch publication changed during replacement disposal/)
    expect(registry.batchPool).toEqual([])
    expect(registry.activeBatches).toEqual([])
    expect(registry.runs.size).toBe(0)
    expect(registry.batchSlots.every((entry) => entry === null)).toBe(true)
    expect(entityFor(replacement)).toBeNull()
  })

  it('freed slot reused by new sprite in same batch', () => {
    const spriteA = makeSprite(texture, material)
    const spriteB = makeSprite(texture, material)

    group.add(spriteA)
    group.add(spriteB)
    runSystems(group)

    const slotA = slot(group, spriteA).slot

    // Remove sprite A (frees its slot)
    group.remove(spriteA)
    runSystems(group)

    // Add sprite C — should get the freed slot
    const spriteC = makeSprite(texture, material)
    group.add(spriteC)
    runSystems(group)

    const slotC = slot(group, spriteC).slot
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
  })

  it('tier upgrade rebuilds batches and re-assigns sprites', () => {
    const sprite = makeSprite(texture, material)
    group.add(sprite)
    runSystems(group)

    expect(has(group, sprite, IsBatched)).toBe(true)
    const registry = getRegistry(group)!
    const initialBatchCount = registry.activeBatches.length
    expect(initialBatchCount).toBe(1)

    // Register an effect big enough to force a tier upgrade past the
    // default of 8. With the interleaved-buffer refactor, system flags
    // + enable bits no longer consume 2 slots in effectBuf0, so the
    // threshold for a tier bump is 8 pure effect floats (not 6). Use
    // three vec4 fields = 12 floats → tier goes from 8 to 12.
    const BigEffect = createMaterialEffect({
      name: 'big_tier',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
        c: [0, 0, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(BigEffect)
    // 12 floats > default tier 8 → upgrades to tier 16. (Effect buffers
    // are now pure data with no flags slot, so 8 floats would fit tier 8
    // and not trigger an upgrade — pick a 12-float effect to actually
    // exercise the tier-upgrade path.)
    expect(material._effectTier).toBe(16)

    // Run systems — should detect version change and rebuild batches
    runSystems(group)

    expect(entityFor(sprite)).not.toBeNull()
    expect(has(group, sprite, IsBatched)).toBe(true)

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
    const color = readRequired(worldFor(group), requiredEntity(sprite), SpriteColor)
    expect(color.a).toBeCloseTo(0.5)
  })
})
