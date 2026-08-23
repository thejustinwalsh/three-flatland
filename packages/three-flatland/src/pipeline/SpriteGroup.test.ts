import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture, type Group, type Object3D } from 'three'
import { SpriteGroup } from './SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { SortLayers } from './sortLayers'
import { SpriteColor, BatchMesh, BatchRegistry, BatchSlot, IsBatched } from '../ecs/traits'
import { batchEntityFor, batchFor, readRequired, requiredEntity } from '../ecs/testUtils.type-test'
import { registryFor } from '../ecs/testUtils.type-test'
import { select, type World } from '../ecs/runtime'
import { MAX_BATCH_SIZE } from '../internal/max-batch-size'
import { createSceneGraphSyncSystem } from '../ecs/systems/sceneGraphSyncSystem'

const INVALID_BATCH_SIZES = [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, MAX_BATCH_SIZE + 1]
const BatchMeshes = select(BatchMesh)

// Create the effect class once so every test exercises the same declared trait.
const DissolveRenderer = createMaterialEffect({
  name: 'dissolve_renderer',
  schema: { progress: 0 },
  node: ({ inputColor }) => inputColor,
})

describe('SpriteGroup', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let renderer: SpriteGroup | null = null

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  afterEach(() => {
    renderer?.dispose()
    renderer = null
  })

  it('should create a renderer with default options', () => {
    renderer = new SpriteGroup()

    expect(renderer.name).toBe('SpriteGroup')
    expect(renderer.isEmpty).toBe(true)
    expect(renderer.autoSort).toBe(true)
    expect(renderer.frustumCulling).toBe(true)
  })

  it('should create a renderer with custom options', () => {
    renderer = new SpriteGroup({
      maxBatchSize: 5000,
      autoSort: false,
      frustumCulling: false,
    })

    expect(renderer.autoSort).toBe(false)
    expect(renderer.frustumCulling).toBe(false)
  })

  it.each(INVALID_BATCH_SIZES)('rejects invalid constructor maxBatchSize %s', (maxBatchSize) => {
    expect(() => new SpriteGroup({ maxBatchSize })).toThrow(
      `maxBatchSize must be a positive safe integer no greater than ${MAX_BATCH_SIZE}`
    )
  })

  it.each(INVALID_BATCH_SIZES)('atomically rejects React-style maxBatchSize property assignment %s', (maxBatchSize) => {
    renderer = new SpriteGroup()
    const registry = registryFor(renderer.world as World)
    const previousMaxBatchSize = renderer.maxBatchSize
    const previousRegistryMaxBatchSize = registry.maxBatchSize
    const previousTierLadder = registry.tierLadder

    expect(() => Object.assign(renderer!, { maxBatchSize })).toThrow(
      `maxBatchSize must be a positive safe integer no greater than ${MAX_BATCH_SIZE}`
    )

    expect(renderer.maxBatchSize).toBe(previousMaxBatchSize)
    expect(registry.maxBatchSize).toBe(previousRegistryMaxBatchSize)
    expect(registry.tierLadder).toBe(previousTierLadder)
  })

  it('should add sprites', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)

    expect(renderer.spriteCount).toBe(1)
    expect(renderer.isEmpty).toBe(false)
  })

  it('should add multiple sprites', () => {
    renderer = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(2)
  })

  it('should remove sprites', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.remove(sprite)

    expect(renderer.spriteCount).toBe(0)
  })

  it('should remove multiple sprites', () => {
    renderer = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.removeSprites(sprite1, sprite2)

    expect(renderer.spriteCount).toBe(0)
  })

  it('releases direct enrollment when a sprite is disposed', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })
    renderer.add(sprite)
    renderer.update()

    sprite.dispose()

    expect(sprite.entity).toBeNull()
    expect(sprite.isMesh).toBe(false)
    expect(renderer.spriteCount).toBe(0)

    renderer.add(sprite)
    renderer.update()
    expect(sprite.entity).toBeNull()
    expect(renderer.spriteCount).toBe(0)
  })

  it('should update batches', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    renderer.add(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate sprites', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    sprite.sortLayer = SortLayers.UI
    renderer.invalidate(sprite)
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should invalidate all sprites', () => {
    renderer = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.update()

    renderer.invalidateAll()
    renderer.update()

    expect(renderer.batchCount).toBe(1)
  })

  it('should provide render stats', () => {
    renderer = new SpriteGroup()
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    renderer.addSprites(sprite1, sprite2)
    renderer.update()

    const stats = renderer.stats

    expect(stats.spriteCount).toBe(2)
    expect(stats.batchCount).toBe(1)
    expect(stats.visibleSprites).toBe(2)
    // drawCalls is no longer on RenderStats — renderer-level metrics
    // live on the devtools bus's `stats` feature.
  })

  it('should clear all sprites', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ texture, material })

    renderer.add(sprite)
    renderer.update()
    const world = renderer.world as World
    const batchEntity = registryFor(world).activeBatches[0]!
    renderer.clear()

    expect(renderer.isEmpty).toBe(true)
    expect(renderer.batchCount).toBe(0)
    expect(renderer.children.length).toBe(0)
    expect(sprite.entity).toBeNull()
    expect(sprite._batchMesh).toBeNull()
    expect(sprite.isMesh).toBe(true)
    expect(world.isAlive(batchEntity)).toBe(false)
    expect(world.view(BatchMeshes)).toHaveLength(0)

    const replacement = new Sprite2D({ texture, material })
    renderer.add(replacement)
    renderer.update()
    expect(world.view(BatchMeshes)).toHaveLength(1)
    renderer.clear()
    expect(world.view(BatchMeshes)).toHaveLength(0)
  })

  it('destroys batch entities when a mesh disposal listener throws during clear', () => {
    renderer = new SpriteGroup()
    renderer.add(new Sprite2D({ texture, material }))
    renderer.update()
    const world = renderer.world as World
    const batchEntity = registryFor(world).activeBatches[0]!
    const mesh = world.read(batchEntity, BatchMesh)!.mesh!
    mesh.geometry.addEventListener('dispose', () => {
      throw 0
    })

    let thrown: unknown = Symbol('not thrown')
    try {
      renderer.clear()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(0)
    expect(world.isAlive(batchEntity)).toBe(false)
    expect(world.view(BatchMeshes)).toHaveLength(0)
    expect(renderer.isEmpty).toBe(true)
  })

  it('finishes terminal disposal after active and pooled mesh listeners throw', () => {
    renderer = new SpriteGroup({ maxBatchSize: 1 })
    const activeSprite = new Sprite2D({ texture, material })
    const pooledSprite = new Sprite2D({ texture, material })
    renderer.addSprites(activeSprite, pooledSprite)
    renderer.update()

    const world = renderer.world as World
    const registry = registryFor(world)
    renderer.remove(pooledSprite)
    renderer.update()
    expect(registry.activeBatches).toHaveLength(1)
    expect(registry.batchPool).toHaveLength(1)

    const activeMesh = world.read(registry.activeBatches[0]!, BatchMesh)!.mesh!
    const pooledMesh = world.read(registry.batchPool[0]!, BatchMesh)!.mesh!
    const activeListener = vi.fn(() => {
      throw 0
    })
    const pooledListener = vi.fn(() => {
      throw 0
    })
    activeMesh.geometry.addEventListener('dispose', activeListener)
    pooledMesh.geometry.addEventListener('dispose', pooledListener)
    const removeMaterialListener = vi.spyOn(material, '_removePreDisposeHook')

    let thrown: unknown = Symbol('not thrown')
    try {
      renderer.dispose()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(0)
    expect(activeListener).toHaveBeenCalledOnce()
    expect(pooledListener).toHaveBeenCalledOnce()
    expect(registry.activeBatches).toEqual([])
    expect(registry.batchPool).toEqual([])
    expect(registry.spriteArr).toEqual([])
    expect(world.disposed).toBe(true)
    expect(removeMaterialListener).toHaveBeenCalledWith(expect.any(Function))
    renderer = null
  })

  it('should add batch objects to scene graph', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.update()

    expect(renderer.children.length).toBe(1)
  })

  it('does no batch reads or parent work on a clean scene-graph frame', () => {
    renderer = new SpriteGroup()
    renderer.add(new Sprite2D({ material }))
    renderer.update()
    const world = renderer.world as World
    expect(registryFor(world).renderOrderDirty).toBe(false)

    const readTraits: unknown[] = []
    const instrumentedWorld = new Proxy(world, {
      get(target, property, receiver) {
        if (property !== 'read') return Reflect.get(target, property, receiver)
        return (entity: Parameters<World['read']>[0], trait: Parameters<World['read']>[1]) => {
          readTraits.push(trait)
          return target.read(entity, trait)
        }
      },
    }) as World
    const untouchedParent = {
      get children(): never {
        throw new Error('clean scene-graph sync touched parent children')
      },
    } as unknown as Group
    const parentAdd = vi.fn((..._objects: Object3D[]) => untouchedParent)
    const parentRemove = vi.fn((..._objects: Object3D[]) => untouchedParent)

    createSceneGraphSyncSystem()(instrumentedWorld, untouchedParent, parentAdd, parentRemove)

    expect(readTraits).toEqual([BatchRegistry])
    expect(parentAdd).not.toHaveBeenCalled()
    expect(parentRemove).not.toHaveBeenCalled()
  })

  it('syncs scene children when a batch is created, recycled, and reused', () => {
    renderer = new SpriteGroup({ maxBatchSize: 1 })
    const first = new Sprite2D({ material })
    renderer.add(first)
    renderer.update()
    const firstBatch = renderer.children.find((child) => (child as { isSpriteBatch?: boolean }).isSpriteBatch)
    expect(firstBatch).toBeDefined()

    renderer.remove(first)
    renderer.update()
    expect(renderer.children.some((child) => (child as { isSpriteBatch?: boolean }).isSpriteBatch)).toBe(false)

    renderer.add(new Sprite2D({ material }))
    renderer.update()
    const reusedBatch = renderer.children.find((child) => (child as { isSpriteBatch?: boolean }).isSpriteBatch)
    expect(reusedBatch).toBe(firstBatch)
  })

  // ============================================
  // updateMatrixWorld integration
  // ============================================

  it('updateMatrixWorld should run systems and sync buffers', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })
    sprite.position.set(100, 200, 0)

    renderer.add(sprite)
    // Use updateMatrixWorld instead of update()
    renderer.updateMatrixWorld()

    expect(renderer.batchCount).toBe(1)
    expect(renderer.children.length).toBe(1)
  })

  it('updateMatrixWorld should sync changed sprite properties', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.updateMatrixWorld()

    const entity = requiredEntity(sprite)
    const batchEntity = batchEntityFor(renderer.world, sprite)
    expect(batchEntity).toBeGreaterThan(0)
    const mesh = batchFor(renderer.world, sprite)
    const slot = readRequired(renderer.world, entity, BatchSlot).slot

    // Change tint — writes to trait only (no immediate batch write)
    sprite.tint = [1, 0, 0]

    // Trait should have new value
    const color = readRequired(renderer.world, entity, SpriteColor)
    expect(color.r).toBe(1)
    expect(color.g).toBe(0)

    // Run systems via updateMatrixWorld — should sync trait to batch buffer
    renderer.updateMatrixWorld()

    // Verify batch buffer was updated. Interleaved layout — color
    // at offsets 4..7 within each instance's 16-float slice.
    const colorAttr = mesh.getColorAttribute()
    const array = colorAttr.array as Float32Array
    const base = slot * 16 + 4
    expect(array[base + 0]).toBeCloseTo(1) // r
    expect(array[base + 1]).toBeCloseTo(0) // g
    expect(array[base + 2]).toBeCloseTo(0) // b
  })

  it('batched: in-place tint.set() mutation writes to batch buffer immediately (R3F compat)', () => {
    renderer = new SpriteGroup()
    const sprite = new Sprite2D({ material })

    renderer.add(sprite)
    renderer.updateMatrixWorld()

    const entity = requiredEntity(sprite)
    const mesh = batchFor(renderer.world, sprite)
    const slot = readRequired(renderer.world, entity, BatchSlot).slot

    // R3F sets nested props by mutating the returned Color in place
    // (`sprite.tint.set(...)`), NOT by reassigning `sprite.tint`. The
    // observable.color.attach wrapper must fire the notify so the batch
    // color buffer updates without a systems pass.
    sprite.tint.set(0, 1, 0)

    const array = mesh.getColorAttribute().array as Float32Array
    expect(array[slot * 16 + 4 + 0]).toBeCloseTo(0) // r
    expect(array[slot * 16 + 4 + 1]).toBeCloseTo(1) // g
    expect(array[slot * 16 + 4 + 2]).toBeCloseTo(0) // b
  })

  it('update() and updateMatrixWorld() should not run systems twice', () => {
    renderer = new SpriteGroup()
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
    renderer = new SpriteGroup()
    material.registerEffect(DissolveRenderer)
    const sprite = new Sprite2D({ material })
    const dissolve = new DissolveRenderer()
    sprite.addEffect(dissolve)

    renderer.add(sprite)
    renderer.updateMatrixWorld()

    const entity = requiredEntity(sprite)
    expect(renderer.world.has(entity, IsBatched)).toBe(true)
    expect(batchEntityFor(renderer.world, sprite)).toBeGreaterThan(0)

    // Change effect property — writes to trait only
    dissolve.progress = 0.8

    // Run systems
    renderer.updateMatrixWorld()

    // Effect trait should be updated (verifying the ECS path works)
    expect(dissolve.progress).toBeCloseTo(0.8)
  })
})
