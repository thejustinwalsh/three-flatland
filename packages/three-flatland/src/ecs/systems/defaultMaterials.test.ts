import { worldFor, entityFor } from '../testUtils.type-test'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Group, Scene, Texture, CustomBlending, OneFactor } from 'three'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { Sprite2D } from '../../sprites/Sprite2D'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import type { RegistryData } from '../batchUtils'
import { registryFor } from '../testUtils.type-test'

function getRegistry(group: SpriteGroup): RegistryData {
  return registryFor(worldFor(group))
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
    expect(entityFor(a)).not.toBeNull()
    expect(entityFor(b)).not.toBeNull()

    // Next system pass re-batches with the fresh material
    group.update()
    expect(registry.activeBatches.length).toBe(1)
    expect(a._batchMesh).not.toBeNull()
    expect(a._batchMesh!.spriteMaterial).toBe(a.material)
    // Direct SpriteGroup sources are not scene children, so they retain the
    // Mesh discriminator; hierarchy and auto sources suppress it instead.
    expect(a.isMesh).toBe(true)

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
    expect(sprite.isMesh).toBe(true)
    expect(entityFor(sprite)).toBeNull() // unenrolled — three's standard semantics apply
    expect(sprite.material).toBe(custom) // we never swap user materials
    expect(group.spriteCount).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disposed material'))

    group.dispose()
  })

  it('runs world cleanup before an earlier user dispose listener throws the exact value 0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const custom = new Sprite2DMaterial({ map: texture })
    const userListener = (): void => {
      throw 0
    }
    // Register before enrollment; EventDispatcher order previously let this
    // abort dispatch before the world's later cleanup listener ran.
    custom.addEventListener('dispose', userListener)
    const group = new SpriteGroup()
    const sprite = new Sprite2D({ texture, material: custom })
    group.add(sprite)
    group.update()
    expect(sprite._batchMesh).not.toBeNull()

    let thrown: unknown = Symbol('not-thrown')
    try {
      custom.dispose()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(sprite.material).toBe(custom)
    expect(entityFor(sprite)).toBeNull()
    expect(sprite._batchMesh).toBeNull()
    expect(sprite.isMesh).toBe(true)
    expect(group.spriteCount).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disposed material'))
    custom.removeEventListener('dispose', userListener)
    group.dispose()
  })

  it('runs every world hook when two worlds share one user material', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shared = new Sprite2DMaterial({ map: texture })
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()
    const spriteA = new Sprite2D({ texture, material: shared })
    const spriteB = new Sprite2D({ texture, material: shared })
    groupA.add(spriteA)
    groupB.add(spriteB)
    groupA.update()
    groupB.update()
    expect(spriteA._batchMesh).not.toBeNull()
    expect(spriteB._batchMesh).not.toBeNull()

    shared.dispose()

    expect(entityFor(spriteA)).toBeNull()
    expect(entityFor(spriteB)).toBeNull()
    expect(spriteA._batchMesh).toBeNull()
    expect(spriteB._batchMesh).toBeNull()
    expect(groupA.spriteCount).toBe(0)
    expect(groupB.spriteCount).toBe(0)
    expect(warn).toHaveBeenCalledTimes(2)
    groupA.dispose()
    groupB.dispose()
  })

  it('keeps a hierarchy sprite unbatched after custom material disposal until replacement', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const custom = new Sprite2DMaterial({ map: texture })
    const scene = new Scene()
    const group = new SpriteGroup()
    const host = new Group()
    const sprite = new Sprite2D({ texture, material: custom })
    host.add(sprite)
    group.add(host)
    scene.add(group)
    scene.updateMatrixWorld(true)
    expect(entityFor(sprite)).not.toBeNull()

    custom.dispose()
    scene.updateMatrixWorld(true)
    expect(entityFor(sprite)).toBeNull()
    expect(sprite.material).toBe(custom)
    expect(sprite.visible).toBe(true)
    expect(sprite.isMesh).toBe(true)
    expect(group.spriteCount).toBe(0)

    sprite.material = new Sprite2DMaterial({ map: texture })
    scene.updateMatrixWorld(true)
    expect(entityFor(sprite)).not.toBeNull()
    expect(sprite._hierarchyOwner).toBe(group)
    expect(sprite.isMesh).toBe(false)
    expect(group.spriteCount).toBe(1)
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

  it('registry-default texture setter re-resolves instead of mutating the shared default', () => {
    const group = new SpriteGroup()
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    group.add(a)
    group.add(b)

    const shared = a.material
    expect(b.material).toBe(shared)
    expect(a._materialWasRegistryDefault).toBe(true)

    const otherTexture = makeTexture()
    a.texture = otherTexture

    // The shared registry default is untouched, and b still holds it.
    expect(shared.getTexture()).toBe(texture)
    expect(b.material).toBe(shared)

    // a re-resolved to a (different) registry default for the new texture.
    expect(a.material).not.toBe(shared)
    expect(a.material.getTexture()).toBe(otherTexture)
    expect(a._materialWasRegistryDefault).toBe(true)

    group.dispose()
  })

  it('bootstrap-default texture setter re-resolves through the world once enrolled', () => {
    // No texture at construction — material stays the bootstrap default
    // (SpriteGroup.add's own resolution is a no-op without a texture).
    const group = new SpriteGroup()
    const sprite = new Sprite2D({})
    group.add(sprite)
    expect(sprite._materialIsBootstrapDefault).toBe(true)

    const other = new Sprite2D({ texture })
    group.add(other)
    const registryDefaultForTexture = other.material

    sprite.texture = texture

    // Re-resolved to this group's registry default for the texture,
    // not a fresh module-global `getShared` instance.
    expect(sprite.material).toBe(registryDefaultForTexture)
    expect(sprite._materialWasRegistryDefault).toBe(true)
    expect(sprite._materialIsBootstrapDefault).toBe(false)

    group.dispose()
  })

  it('repeated texture swaps do not leak abandoned default materials in registry.materialRefs', () => {
    const group = new SpriteGroup()
    const a = new Sprite2D({ texture })
    group.add(a)
    group.update() // batchAssignSystem: a batches under materialA

    const registry = getRegistry(group)
    const materialA = a.material
    expect(registry.materialRefs.has(materialA.batchId)).toBe(true)

    const textureB = makeTexture()
    a.texture = textureB
    group.update() // batchReassignSystem: a moves off materialA onto materialB
    const materialB = a.material
    expect(materialB).not.toBe(materialA)

    // materialA has zero batched users now — its materialRefs entry
    // (and the strong ref to the material + its texture it carries)
    // must be dropped, not held forever.
    expect(registry.materialRefs.has(materialA.batchId)).toBe(false)
    expect(registry.materialRefs.has(materialB.batchId)).toBe(true)

    const textureC = makeTexture()
    a.texture = textureC
    group.update()
    const materialC = a.material
    expect(materialC).not.toBe(materialB)

    // Same invariant holds on a second swap: materialB is now orphaned too.
    expect(registry.materialRefs.has(materialA.batchId)).toBe(false)
    expect(registry.materialRefs.has(materialB.batchId)).toBe(false)
    expect(registry.materialRefs.has(materialC.batchId)).toBe(true)

    group.dispose()
  })
})

// A provider-style effect with a constant (factory) field — the
// `Sprite2D.addEffect` constants branch routes these through a material
// *variant* (keyed by texture + effectsKey), not the plain default.
const VariantMarker = createMaterialEffect({
  name: 'variantMarker',
  schema: { marker: () => null as Texture | null },
  node: ({ inputColor }) => inputColor,
})

describe('registry-scoped effect-variant materials + dispose resurrection', () => {
  let texture: Texture

  beforeEach(() => {
    texture = makeTexture()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('two groups sharing a texture+effect+constants combination hold their OWN variant instances', () => {
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()

    const spriteA = new Sprite2D({ texture })
    const spriteB = new Sprite2D({ texture })
    groupA.add(spriteA)
    groupB.add(spriteB)

    spriteA.addEffect(new VariantMarker())
    spriteB.addEffect(new VariantMarker())

    expect(spriteA.material).not.toBe(spriteB.material)
    expect(spriteA._materialWasRegistryVariant).toBe(true)
    expect(spriteB._materialWasRegistryVariant).toBe(true)
    expect(spriteA.material.hasEffect(VariantMarker)).toBe(true)
    expect(spriteB.material.hasEffect(VariantMarker)).toBe(true)

    groupA.dispose()
    groupB.dispose()
  })

  it('sprites in the same group with the same combination share one variant instance (cache hit)', () => {
    const group = new SpriteGroup()
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    group.add(a)
    group.add(b)

    const sharedDefault = a.material
    expect(b.material).toBe(sharedDefault)

    a.addEffect(new VariantMarker())
    b.addEffect(new VariantMarker())

    expect(a.material).toBe(b.material)
    expect(a.material).not.toBe(sharedDefault)
    expect(a.material.hasEffect(VariantMarker)).toBe(true)

    group.dispose()
  })

  it("disposing world A's variant does not affect world B's sprites", () => {
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()

    const spriteA = new Sprite2D({ texture })
    const spriteB = new Sprite2D({ texture })
    groupA.add(spriteA)
    groupB.add(spriteB)

    spriteA.addEffect(new VariantMarker())
    spriteB.addEffect(new VariantMarker())

    const variantA = spriteA.material
    const variantB = spriteB.material
    expect(variantA).not.toBe(variantB)

    variantA.dispose()

    // spriteA resurrects with a fresh variant carrying the same effect;
    // spriteB (a different world) is untouched.
    expect(spriteA.material).not.toBe(variantA)
    expect(spriteA._materialWasRegistryVariant).toBe(true)
    expect(spriteA.material.hasEffect(VariantMarker)).toBe(true)
    expect(entityFor(spriteA)).not.toBeNull()

    expect(spriteB.material).toBe(variantB)
    expect(variantB.hasEffect(VariantMarker)).toBe(true)

    groupA.dispose()
    groupB.dispose()
  })

  it('pre-enrollment sprite resolves via the module-global path, then re-resolves world-scoped on enrollment', () => {
    const sprite = new Sprite2D({ texture })
    sprite.addEffect(new VariantMarker())

    expect(sprite._materialIsBootstrapVariant).toBe(true)
    expect(sprite._materialWasRegistryVariant).toBe(false)
    const bootstrapVariant = sprite.material
    expect(bootstrapVariant.hasEffect(VariantMarker)).toBe(true)

    const group = new SpriteGroup()
    group.add(sprite)

    // Re-resolved off the module-global fallback onto this group's
    // world-scoped variant store.
    expect(sprite.material).not.toBe(bootstrapVariant)
    expect(sprite._materialIsBootstrapVariant).toBe(false)
    expect(sprite._materialWasRegistryVariant).toBe(true)
    expect(sprite.material.hasEffect(VariantMarker)).toBe(true)

    group.dispose()
  })

  it('re-resolution preserves non-default alphaTest / premultipliedAlpha (variant-key flags)', () => {
    // `alphaTest` (opaque + depth fast-path) and `premultipliedAlpha`
    // (CustomBlending) both live in the variant cache key and both change
    // the shader / blend state, so every re-resolution must carry them —
    // otherwise the resurrected variant silently reverts to alphaTest=0 /
    // normal blending. The material starts with both set to non-defaults.
    const group = new SpriteGroup()
    const sprite = new Sprite2D({
      texture,
      material: Sprite2DMaterial.getShared({
        map: texture,
        alphaTest: 0.5,
        premultipliedAlpha: true,
      }),
    })
    group.add(sprite)

    // Site 1 — addEffect mints a world-scoped variant from the current
    // material's options; the variant must inherit both flags.
    sprite.addEffect(new VariantMarker())
    const variant = sprite.material
    expect(sprite._materialWasRegistryVariant).toBe(true)
    expect(variant.hasEffect(VariantMarker)).toBe(true)
    expect(variant.alphaTest).toBe(0.5)
    expect(variant.blending).toBe(CustomBlending)
    expect(variant.blendSrc).toBe(OneFactor)

    // Site 2 — dispose resurrection re-resolves via `_currentVariantOptions`;
    // the fresh variant must still carry both flags.
    variant.dispose()
    const resurrected = sprite.material
    expect(resurrected).not.toBe(variant)
    expect(resurrected.hasEffect(VariantMarker)).toBe(true)
    expect(resurrected.alphaTest).toBe(0.5)
    expect(resurrected.blending).toBe(CustomBlending)
    expect(resurrected.blendSrc).toBe(OneFactor)

    group.dispose()
  })
})
