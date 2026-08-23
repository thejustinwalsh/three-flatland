import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { declareSortLayer } from '../../pipeline/sortLayers'
import { IsBatched, BatchRegistry, BatchMeta, CameraLayersMask, SpriteMaterialRef } from '../traits'
import type { RegistryData } from '../batchUtils'
import { batchEntityFor, readRequired, registryFor, requiredEntity } from '../testUtils.type-test'

function getRegistry(group: SpriteGroup): RegistryData {
  return registryFor(group.world)
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
      .map((entity) => readRequired(group.world, entity, BatchMeta).layersMask)
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
    expect(readRequired(group.world, requiredEntity(a), CameraLayersMask).mask).toBe(1 | (1 << 5))

    runSystems(group)

    // Still batched — but in a new batch with the new mask
    expect(group.world.has(requiredEntity(a), IsBatched)).toBe(true)
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
    expect(readRequired(group.world, requiredEntity(a), CameraLayersMask).mask).toBe(1 << 5)

    runSystems(group)

    // Still batched — but in a new batch with the new mask
    expect(group.world.has(requiredEntity(a), IsBatched)).toBe(true)
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
    const meta = readRequired(group.world, registry.activeBatches[0]!, BatchMeta)
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
    expect(group.world.has(requiredEntity(a), IsBatched)).toBe(true)
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

    const meta = readRequired(group.world, batchEntityFor(group.world, sprite), BatchMeta)
    expect(sprite.layers.mask).toBe(1 << 3)
    expect(readRequired(group.world, requiredEntity(sprite), CameraLayersMask).mask).toBe(1 << 3)
    expect(meta.layersMask).toBe(1 << 3)
  })

  it('routes direct material assignment through the live batch and dispose hook', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sprite = new Sprite2D({ texture, material })
    const replacement = new Sprite2DMaterial({ map: texture })
    group.add(sprite)
    runSystems(group)

    sprite.material = replacement
    expect(readRequired(group.world, requiredEntity(sprite), SpriteMaterialRef).materialId).toBe(replacement.batchId)
    runSystems(group)

    const registry = getRegistry(group)
    const meta = readRequired(group.world, batchEntityFor(group.world, sprite), BatchMeta)
    expect(meta.materialId).toBe(replacement.batchId)
    expect(sprite._batchMesh?.spriteMaterial).toBe(replacement)
    expect(registry.materialRefs.get(replacement.batchId)?.material).toBe(replacement)

    replacement.dispose()
    expect(sprite.entity).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disposed material'))
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

    expect(enrolled.entity).toBeNull()
    expect(enrolled.geometry.hasAttribute('effectBuf0')).toBe(true)
    const buffer = enrolled.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }
    expect(buffer.array[0]).toBeCloseTo(0.7)
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
    expect(a.entity).toBeNull()
    expect(a._renderOrderOverridden).toBe(true)
    expect(a.visible).toBe(true)
    // Re-parented under the group so its own Mesh draw resumes
    expect(group.children.includes(a)).toBe(true)

    runSystems(group)

    // Slot freed; the other member is unaffected
    expect(batchMesh.activeCount).toBe(1)
    expect(b.entity).not.toBeNull()
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
    expect(a.entity).not.toBeNull()

    a.renderOrder = 6 // matches the layer-derived value → no escape
    expect(a.entity).not.toBeNull()
    expect(a._renderOrderOverridden).toBe(false)

    a.renderOrder = 999 // a real override still escapes
    expect(a.entity).toBeNull()
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
    expect(a.entity).toBeNull()
    expect(a._renderOrderOverridden).toBe(true)
    expect(group.children.includes(a)).toBe(true)
    const childCountAfterDemotion = group.children.length

    // Writing the SAME value again must short-circuit before any of the
    // override/demotion machinery re-runs — no duplicate re-parenting.
    a.renderOrder = 999
    expect(a.renderOrder).toBe(999)
    expect(a.entity).toBeNull()
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
