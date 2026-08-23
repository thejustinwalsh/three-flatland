import { worldFor, entityFor } from '../testUtils.type-test'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { SpriteBatch } from '../../pipeline/SpriteBatch'
import { declareSortLayer } from '../../pipeline/sortLayers'
import { IsBatched, BatchRegistry, BatchMeta, BatchSlot, CameraLayersMask, SpriteMaterialRef } from '../traits'
import type { RegistryData } from '../batchUtils'
import { batchEntityFor, readRequired, registryFor, requiredEntity } from '../testUtils.type-test'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

function getRegistry(group: SpriteGroup): RegistryData {
  return registryFor(worldFor(group))
}

function runSystems(group: SpriteGroup): void {
  group.update()
}

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 100, height: 100 }
  return texture
}

describe('sortLayer + layers.mask run-key routing', () => {
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

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32, -(2 ** 31) - 1])(
    'rejects non-int32 sort-layer order %s before run-key encoding',
    (invalid) => {
      const sprite = new Sprite2D({ texture, material })
      expect(() => {
        sprite.sortLayer = invalid
      }).toThrow(/signed 32-bit integer/)
      expect(() => declareSortLayer('minimap', { renderOrder: invalid })).toThrow(/signed 32-bit integer/)
    }
  )

  it('same material + sortLayer but different layers masks produce separate batches', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    const c = new Sprite2D({ texture, material })

    b.layers.set(2)
    c.layers.set(3)

    group.add(a)
    group.add(b)
    group.add(c)
    runSystems(group)

    const registry = getRegistry(group)
    expect(registry.activeBatches.length).toBe(3)

    const masks = registry.activeBatches
      .map((entity) => readRequired(worldFor(group), entity, BatchMeta).layersMask)
      .sort((x, y) => x - y)
    expect(masks).toEqual([1, 4, 8]) // Layers.set(n) = 1 << n

    // The batch meshes inherit their run's camera mask
    const meshMasks = registry.batchSlots
      .filter((m) => m !== null)
      .map((m) => m!.layers.mask)
      .sort((x, y) => x - y)
    expect(meshMasks).toEqual([1, 4, 8])
  })

  it('layers.enable(N) mutation routes the sprite to a differently-masked batch (still batched)', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const registry = getRegistry(group)
    expect(registry.activeBatches.length).toBe(1)
    const originalMesh = a._batchMesh

    a.layers.enable(5)
    expect(readRequired(worldFor(group), requiredEntity(a), CameraLayersMask).mask).toBe(1 | (1 << 5))

    runSystems(group)

    // Still batched — but in a new batch with the new mask
    expect(worldFor(group).has(requiredEntity(a), IsBatched)).toBe(true)
    expect(a._batchMesh).not.toBe(originalMesh)
    expect(a._batchMesh!.layers.mask).toBe(1 | (1 << 5))
    expect(registry.activeBatches.length).toBe(2)

    // b stays in the original batch
    expect(b._batchMesh).toBe(originalMesh)
  })

  it('layers.set(N) mutation routes the sprite to a differently-masked batch (still batched)', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const registry = getRegistry(group)
    expect(registry.activeBatches.length).toBe(1)
    const originalMesh = a._batchMesh

    // Unlike enable(N) (OR's a bit in), set(N) replaces the whole mask —
    // a distinct write path through the Layers instance that must still
    // funnel through the same Proxy `set` trap.
    a.layers.set(5)
    expect(readRequired(worldFor(group), requiredEntity(a), CameraLayersMask).mask).toBe(1 << 5)

    runSystems(group)

    // Still batched — but in a new batch with the new mask
    expect(worldFor(group).has(requiredEntity(a), IsBatched)).toBe(true)
    expect(a._batchMesh).not.toBe(originalMesh)
    expect(a._batchMesh!.layers.mask).toBe(1 << 5)
    expect(registry.activeBatches.length).toBe(2)

    // b stays in the original batch
    expect(b._batchMesh).toBe(originalMesh)
  })

  it('named sortLayer assignment resolves through the declared registry', () => {
    declareSortLayer('ui', { renderOrder: 6 })
    const sprite = new Sprite2D({ texture, material })
    sprite.sortLayer = 'ui'

    expect(sprite.sortLayer).toBe('ui')
    expect(sprite.sortLayerValue).toBe(6)

    group.add(sprite)
    runSystems(group)

    const registry = getRegistry(group)
    const meta = readRequired(worldFor(group), registry.activeBatches[0]!, BatchMeta)
    expect(meta.sortLayer).toBe(6)
  })

  it('sortLayer change reroutes to a different run', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const registry = getRegistry(group)
    expect(registry.activeBatches.length).toBe(1)

    a.sortLayer = 'ui'
    runSystems(group)

    expect(registry.activeBatches.length).toBe(2)
    expect(worldFor(group).has(requiredEntity(a), IsBatched)).toBe(true)
  })

  it('captures a route mutation made reentrantly by updateMatrix in the same frame', () => {
    const sprite = new Sprite2D({ texture, material })
    group.add(sprite)
    runSystems(group)

    const updateMatrix = sprite.updateMatrix.bind(sprite)
    let mutateRoute = true
    sprite.updateMatrix = () => {
      updateMatrix()
      if (mutateRoute) {
        mutateRoute = false
        sprite.layers.set(3)
      }
    }

    sprite.sortLayer = 'ui'
    runSystems(group)

    const meta = readRequired(worldFor(group), batchEntityFor(worldFor(group), sprite), BatchMeta)
    expect(sprite.layers.mask).toBe(1 << 3)
    expect(readRequired(worldFor(group), requiredEntity(sprite), CameraLayersMask).mask).toBe(1 << 3)
    expect(meta.layersMask).toBe(1 << 3)
  })

  it('reroutes a settled sprite when transform updateMatrix changes its full route', () => {
    declareSortLayer('late-route', { renderOrder: 9 })
    const sprite = new Sprite2D({ texture, material })
    const survivor = new Sprite2D({ texture, material })
    group.add(sprite, survivor)
    runSystems(group)
    const originalMesh = sprite._batchMesh
    const replacement = new Sprite2DMaterial({ map: texture })
    const updateMatrix = sprite.updateMatrix.bind(sprite)
    let mutateRoute = true
    sprite.updateMatrix = () => {
      updateMatrix()
      if (!mutateRoute) return
      mutateRoute = false
      sprite.material = replacement
      sprite.sortLayer = 'late-route'
      sprite.layers.set(4)
    }

    // No route event exists at frame start. The mutation happens in the
    // transform pass, after the primary reassign drain, and must still be
    // committed before this update returns.
    runSystems(group)

    const batchEntity = batchEntityFor(worldFor(group), sprite)
    const meta = readRequired(worldFor(group), batchEntity, BatchMeta)
    expect(sprite._batchMesh).not.toBe(originalMesh)
    expect(survivor._batchMesh).toBe(originalMesh)
    expect(meta.materialId).toBe(replacement.batchId)
    expect(meta.sortLayer).toBe(9)
    expect(meta.layersMask).toBe(1 << 4)
    expect(sprite._batchMesh!.layers.mask).toBe(1 << 4)
    expect(group.children).toContain(sprite._batchMesh)
    expect(readRequired(worldFor(group), requiredEntity(sprite), BatchSlot).batchEntity).toBe(batchEntity)
  })

  it('does not publish a reassignment after updateMatrix removes the sprite', () => {
    const sprite = new Sprite2D({ texture, material })
    const survivor = new Sprite2D({ texture, material })
    group.add(sprite)
    group.add(survivor)
    runSystems(group)
    const oldBatch = sprite._batchMesh!
    const oldSlot = sprite._batchSlot
    const updateMatrix = sprite.updateMatrix.bind(sprite)
    let removeDuringUpdate = true
    sprite.updateMatrix = () => {
      updateMatrix()
      if (removeDuringUpdate) {
        removeDuringUpdate = false
        group.remove(sprite)
      }
    }

    sprite.sortLayer = 'ui'
    runSystems(group)
    expect(entityFor(sprite)).toBeNull()
    expect(sprite._batchMesh).toBeNull()

    runSystems(group)
    expect(getSpriteBatchOwnership(oldBatch).slotEntities[oldSlot]).toBe(0)
    sprite.alpha = 0.25
    expect(getSpriteBatchOwnership(oldBatch).slotEntities[oldSlot]).toBe(0)
    expect(survivor._batchMesh).toBe(oldBatch)
  })

  it('scrubs an interior destination row and grid projection after failed reassignment', () => {
    group.maxBatchSize = 3
    const destinationFirst = new Sprite2D({ texture, material })
    const destinationRemoved = new Sprite2D({ texture, material })
    const destinationLast = new Sprite2D({ texture, material })
    const sourceMaterial = new Sprite2DMaterial({ map: texture })
    const source = new Sprite2D({ texture, material: sourceMaterial })
    group.add(destinationFirst, destinationRemoved, destinationLast, source)
    runSystems(group)

    const destinationBatch = destinationFirst._batchMesh!
    const interior = destinationRemoved._batchSlot
    const sourceBatch = source._batchMesh!
    const sourceAssignment = { ...readRequired(worldFor(group), requiredEntity(source), BatchSlot) }
    group.remove(destinationRemoved)
    runSystems(group)
    expect(getSpriteBatchOwnership(destinationBatch).slotEntities[interior]).toBe(0)
    expect(destinationBatch.grid.size).toBe(2)

    source.material = material
    const writeSystemFlags = vi.spyOn(SpriteBatch.prototype, 'writeSystemFlags').mockImplementationOnce(() => {
      throw new Error('late reassignment projection failed')
    })

    expect(() => runSystems(group)).toThrow('late reassignment projection failed')
    expect(source._batchMesh).toBe(sourceBatch)
    expect(readRequired(worldFor(group), requiredEntity(source), BatchSlot)).toEqual(sourceAssignment)
    expect(getSpriteBatchOwnership(destinationBatch).slotEntities[interior]).toBe(0)
    expect(
      Array.from((destinationBatch.instanceMatrix.array as Float32Array).slice(interior * 16, interior * 16 + 16))
    ).toEqual(Array(16).fill(0))
    expect((destinationBatch.getColorAttribute().array as Float32Array)[interior * 16 + 4 + 3]).toBe(0)
    expect(destinationBatch.grid.size).toBe(2)
    expect(sourceBatch.grid.size).toBe(1)

    writeSystemFlags.mockRestore()
    runSystems(group)
    expect(source._batchMesh).toBe(destinationBatch)
    expect(source._batchSlot).toBe(interior)
    expect(destinationBatch.grid.size).toBe(3)
  })

  it('requeues the untouched reassignment tail after the middle sprite throws transiently', () => {
    const sprites = [
      new Sprite2D({ texture, material }),
      new Sprite2D({ texture, material }),
      new Sprite2D({ texture, material }),
    ]
    group.add(...sprites)
    runSystems(group)

    const replacement = new Sprite2DMaterial({ map: texture })
    const updateMatrix = vi.spyOn(sprites[1]!, 'updateMatrix').mockImplementationOnce(() => {
      throw new Error('middle reassignment failed')
    })
    for (const sprite of sprites) sprite.material = replacement

    expect(() => runSystems(group)).toThrow('middle reassignment failed')
    expect(readRequired(worldFor(group), batchEntityFor(worldFor(group), sprites[0]!), BatchMeta).materialId).toBe(
      replacement.batchId
    )
    expect(sprites[1]!._batchMesh).toBe(sprites[2]!._batchMesh)

    updateMatrix.mockRestore()
    runSystems(group)
    for (const sprite of sprites) {
      expect(readRequired(worldFor(group), batchEntityFor(worldFor(group), sprite), BatchMeta).materialId).toBe(
        replacement.batchId
      )
    }
  })

  it('keeps source ownership and retries after destination construction fails', () => {
    group.maxBatchSize = 1
    const sprite = new Sprite2D({ texture, material })
    group.add(sprite)
    runSystems(group)

    const registry = getRegistry(group)
    const oldAssignment = { ...readRequired(worldFor(group), requiredEntity(sprite), BatchSlot) }
    const oldBatch = sprite._batchMesh
    const replacement = new Sprite2DMaterial({ map: texture })
    registry.maxBatchSize = 0
    sprite.material = replacement

    expect(() => runSystems(group)).toThrow(/positive safe integer/)
    expect(readRequired(worldFor(group), requiredEntity(sprite), BatchSlot)).toEqual(oldAssignment)
    expect(sprite._batchMesh).toBe(oldBatch)
    expect(registry.runs.size).toBe(1)
    expect(registry.sortedRunKeys).toHaveLength(1)

    registry.maxBatchSize = 1
    runSystems(group)
    expect(sprite._batchMesh).not.toBe(oldBatch)
    expect(readRequired(worldFor(group), batchEntityFor(worldFor(group), sprite), BatchMeta).materialId).toBe(
      replacement.batchId
    )
  })

  it('routes direct material assignment through the live batch and dispose hook', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sprite = new Sprite2D({ texture, material })
    const replacement = new Sprite2DMaterial({ map: texture })
    const removeHook = vi.spyOn(replacement, '_removePreDisposeHook')
    group.add(sprite)
    runSystems(group)

    sprite.material = replacement
    expect(readRequired(worldFor(group), requiredEntity(sprite), SpriteMaterialRef).materialId).toBe(replacement.batchId)
    runSystems(group)

    const registry = getRegistry(group)
    const meta = readRequired(worldFor(group), batchEntityFor(worldFor(group), sprite), BatchMeta)
    expect(meta.materialId).toBe(replacement.batchId)
    expect(sprite._batchMesh?.spriteMaterial).toBe(replacement)
    expect(registry.materialRefs.get(replacement.batchId)?.material).toBe(replacement)

    replacement.dispose()
    expect(entityFor(sprite)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disposed material'))
    expect(removeHook).toHaveBeenCalledWith(expect.any(Function))

    warn.mockClear()
    replacement.dispose()
    expect(warn).not.toHaveBeenCalled()
  })

  it('sorts a material reassignment inside its populated destination batch', () => {
    const destinationMaterial = new Sprite2DMaterial({ map: texture, transparent: true })
    const destination = new Sprite2D({ texture, material: destinationMaterial })
    const moving = new Sprite2D({ texture, material })
    destination.zIndex = 10
    moving.zIndex = -5
    group.add(destination)
    group.add(moving)
    runSystems(group)

    moving.material = destinationMaterial
    runSystems(group)

    expect(moving._batchMesh).toBe(destination._batchMesh)
    expect(moving._batchSlot).toBeLessThan(destination._batchSlot)
    expect(getSpriteBatchOwnership(moving._batchMesh!).slotEntities[moving._batchSlot]).toBe(requiredEntity(moving))
    expect(getSpriteBatchOwnership(destination._batchMesh!).slotEntities[destination._batchSlot]).toBe(
      requiredEntity(destination)
    )
  })

  it('sorts a layer reassignment inside its populated destination batch', () => {
    const destination = new Sprite2D({ texture, material })
    const moving = new Sprite2D({ texture, material })
    destination.sortLayer = 'ui'
    destination.zIndex = 10
    moving.zIndex = -5
    group.add(destination)
    group.add(moving)
    runSystems(group)

    moving.sortLayer = 'ui'
    runSystems(group)

    expect(moving._batchMesh).toBe(destination._batchMesh)
    expect(moving._batchSlot).toBeLessThan(destination._batchSlot)
    expect(getSpriteBatchOwnership(moving._batchMesh!).slotEntities[moving._batchSlot]).toBe(requiredEntity(moving))
    expect(getSpriteBatchOwnership(destination._batchMesh!).slotEntities[destination._batchSlot]).toBe(
      requiredEntity(destination)
    )
  })

  it('rebuilds source effect attributes on direct material assignment', () => {
    const noEffects = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    const withEffects = new Sprite2DMaterial({ map: texture, effectTier: 8 })
    const standalone = new Sprite2D({ texture, material: noEffects })

    expect(standalone.geometry.hasAttribute('effectBuf0')).toBe(false)
    standalone.material = withEffects
    expect(standalone.geometry.hasAttribute('effectBuf0')).toBe(true)
    standalone.material = noEffects
    expect(standalone.geometry.hasAttribute('effectBuf0')).toBe(false)

    const Intensity = createMaterialEffect({
      name: 'directMaterialAssignmentIntensity',
      schema: { value: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const enrolledMaterial = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    const enrolled = new Sprite2D({ texture, material: enrolledMaterial })
    const intensity = new Intensity()
    enrolled.addEffect(intensity)
    group.add(enrolled)
    runSystems(group)
    intensity.value = 0.7
    enrolled.material = withEffects
    runSystems(group)
    enrolled.renderOrder = 999

    expect(entityFor(enrolled)).toBeNull()
    expect(enrolled.geometry.hasAttribute('effectBuf0')).toBe(true)
    const buffer = enrolled.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }
    expect(buffer.array[0]).toBeCloseTo(0.7)
  })

  it('rejects an over-cap direct material assignment without publishing partial state', () => {
    const Full = createMaterialEffect({
      name: 'directMaterialAtomicFull',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
        c: [0, 0, 0, 0],
        d: [0, 0, 0, 0],
        e: [0, 0, 0, 0],
        f: [0, 0, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })
    const Extra = createMaterialEffect({
      name: 'directMaterialAtomicExtra',
      schema: { value: [0, 0, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    const assertRejectedAtomically = (sprite: Sprite2D, replacement: Sprite2DMaterial): void => {
      const original = sprite.material
      const originalAttributes = Object.keys(sprite.geometry.attributes).sort()
      const replacementEffects = replacement.getEffects()

      expect(() => {
        sprite.material = replacement
      }).toThrow(/exceeding the cap/)

      expect(sprite.material).toBe(original)
      expect(Object.keys(sprite.geometry.attributes).sort()).toEqual(originalAttributes)
      expect(replacement.getEffects()).toEqual(replacementEffects)
      expect(replacement.hasEffect(Full)).toBe(false)
    }

    const standaloneMaterial = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    const standaloneReplacement = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    standaloneReplacement.registerEffect(Extra)
    const standalone = new Sprite2D({ texture, material: standaloneMaterial })
    standalone.addEffect(new Full())
    assertRejectedAtomically(standalone, standaloneReplacement)

    const enrolledMaterial = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    const enrolledReplacement = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    enrolledReplacement.registerEffect(Extra)
    const enrolled = new Sprite2D({ texture, material: enrolledMaterial })
    enrolled.addEffect(new Full())
    group.add(enrolled)
    runSystems(group)

    const entity = requiredEntity(enrolled)
    const originalBatch = enrolled._batchMesh
    const originalSlot = enrolled._batchSlot
    const registry = getRegistry(group)
    assertRejectedAtomically(enrolled, enrolledReplacement)
    expect(readRequired(worldFor(group), entity, SpriteMaterialRef).materialId).toBe(enrolledMaterial.batchId)
    expect(enrolled._batchMesh).toBe(originalBatch)
    expect(enrolled._batchSlot).toBe(originalSlot)
    expect(getSpriteBatchOwnership(originalBatch!).slotEntities[originalSlot]).toBe(entity)
    expect(registry.materialRefs.has(enrolledReplacement.batchId)).toBe(false)
  })

  it('renderOrder override demotes the sprite to standalone with the custom order', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    const registry = getRegistry(group)
    const batchMesh = registry.batchSlots[0]!
    expect(batchMesh.activeCount).toBe(2)

    a.renderOrder = 999

    expect(a.renderOrder).toBe(999)
    expect(entityFor(a)).toBeNull()
    expect(a._renderOrderOverridden).toBe(true)
    expect(a.visible).toBe(true)
    // Re-parented under the group so its own Mesh draw resumes
    expect(group.children.includes(a)).toBe(true)

    runSystems(group)

    // Slot freed; the other member is unaffected
    expect(batchMesh.activeCount).toBe(1)
    expect(entityFor(b)).not.toBeNull()
    expect(b._batchMesh).toBe(batchMesh)
  })

  it('batch renderOrder derives from the sortLayer value (foreign interop contract)', () => {
    declareSortLayer('minimap', { renderOrder: 250 })
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.sortLayer = 'minimap'
    b.sortLayer = 'minimap'
    group.add(a)
    group.add(b)
    runSystems(group)

    const registry = getRegistry(group)
    const mesh = registry.batchSlots.find((m) => m !== null)!
    // A foreign object at renderOrder 249 must draw before this batch
    expect(Math.floor(mesh.renderOrder)).toBe(250)
  })

  it('writing the sortLayer-derived renderOrder back is a no-op (stays batched)', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.sortLayer = 6
    b.sortLayer = 6
    group.add(a)
    group.add(b)
    runSystems(group)
    expect(entityFor(a)).not.toBeNull()

    a.renderOrder = 6 // matches the layer-derived value → no escape
    expect(entityFor(a)).not.toBeNull()
    expect(a._renderOrderOverridden).toBe(false)

    a.renderOrder = 999 // a real override still escapes
    expect(entityFor(a)).toBeNull()
  })

  it('renderOrder is installed as a prototype accessor, not an own instance property', () => {
    const sprite = new Sprite2D({ texture, material })
    expect(Object.prototype.hasOwnProperty.call(sprite, 'renderOrder')).toBe(false)

    const descriptor = Object.getOwnPropertyDescriptor(Sprite2D.prototype, 'renderOrder')
    expect(descriptor).toBeDefined()
    expect(typeof descriptor!.get).toBe('function')
    expect(typeof descriptor!.set).toBe('function')

    // The accessor still round-trips a plain numeric read/write.
    sprite.renderOrder = 42
    expect(sprite.renderOrder).toBe(42)
  })

  it('re-setting renderOrder to its current (already-overridden) value is a no-op', () => {
    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    group.add(a)
    group.add(b)
    runSystems(group)

    a.renderOrder = 999 // first write: a real override, demotes to standalone
    expect(entityFor(a)).toBeNull()
    expect(a._renderOrderOverridden).toBe(true)
    expect(group.children.includes(a)).toBe(true)
    const childCountAfterDemotion = group.children.length

    // Writing the SAME value again must short-circuit before any of the
    // override/demotion machinery re-runs — no duplicate re-parenting.
    a.renderOrder = 999
    expect(a.renderOrder).toBe(999)
    expect(entityFor(a)).toBeNull()
    expect(group.children.length).toBe(childCountAfterDemotion)
  })

  it('unenroll clears cached batch refs so setters cannot write into freed slots', () => {
    const a = new Sprite2D({ texture, material })
    group.add(a)
    runSystems(group)
    expect(a._batchMesh).not.toBeNull()

    group.remove(a)

    expect(a._batchMesh).toBeNull()
    expect(a._batchSlot).toBe(-1)
    // Setter after removal must not throw or touch batch buffers
    a.alpha = 0.5
    expect(a.alpha).toBe(0.5)
  })
})
