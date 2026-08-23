import { worldFor, entityFor, traitFor } from '../ecs/testUtils.type-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { createMaterialEffect } from './MaterialEffect'
import { Sprite2DMaterial } from './Sprite2DMaterial'

const PackedEffect = createMaterialEffect({
  name: 'packed_effect_hot_path',
  schema: { scalar: 0, vector: [0, 0, 0, 0] as const },
  node: ({ inputColor }) => inputColor,
})

const PrefixEffect = createMaterialEffect({
  name: 'packed_effect_prefix',
  schema: { prefix: 0 },
  node: ({ inputColor }) => inputColor,
})

const ConstantVariantEffect = createMaterialEffect({
  name: 'constant_variant_readd',
  schema: { scalar: 0, variant: () => 'stable' },
  node: ({ inputColor }) => inputColor,
})

const OverflowVectorEffect = createMaterialEffect({
  name: 'projection_overflow_vector',
  schema: { vector: [0, 0] as const },
  node: ({ inputColor }) => inputColor,
})

const OverflowSentinelEffect = createMaterialEffect({
  name: 'projection_overflow_sentinel',
  schema: { sentinel: 0 },
  node: ({ inputColor }) => inputColor,
})

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  return texture
}

function expectPackedRow(sprite: Sprite2D, scalar: number, vector: readonly number[]): void {
  const mesh = sprite._batchMesh!
  const slot = sprite._batchSlot
  const first = mesh.getCustomBuffer('effectBuf0')!.buffer
  const second = mesh.getCustomBuffer('effectBuf1')!.buffer
  const offset = slot * 4
  expect([...first.subarray(offset, offset + 4)]).toEqual([scalar, vector[0], vector[1], vector[2]])
  expect(second[offset]).toBe(vector[3])
}

function makeOverflowFixture(texture: Texture): {
  sprite: Sprite2D
  vector: InstanceType<typeof OverflowVectorEffect>
} {
  const material = new Sprite2DMaterial({ map: texture })
  material.registerEffect(OverflowVectorEffect)
  material.registerEffect(OverflowSentinelEffect)
  const sprite = new Sprite2D({ texture, material })
  const vector = new OverflowVectorEffect()
  const sentinel = new OverflowSentinelEffect()
  vector.vector = [1, 2]
  sentinel.sentinel = 77

  // Reverse attachment order makes an oversized vec2 projection run after
  // the sentinel and exposes any writer that trusts the mutable array length.
  sprite.addEffect(sentinel)
  sprite.addEffect(vector)
  return { sprite, vector }
}

function pushOverflow(vector: InstanceType<typeof OverflowVectorEffect>): void {
  ;(vector.vector as unknown as number[]).push(999)
}

function expectSentinelRow(sprite: Sprite2D): void {
  const mesh = sprite._batchMesh!
  const offset = sprite._batchSlot * 4
  expect([...mesh.getCustomBuffer('effectBuf0')!.buffer.subarray(offset, offset + 4)]).toEqual([1, 2, 77, 0])
}

describe('MaterialEffect batched field writes', () => {
  let group: SpriteGroup | null = null
  const extraGroups: SpriteGroup[] = []

  afterEach(() => {
    group?.dispose()
    group = null
    for (const extraGroup of extraGroups.splice(0)) extraGroup.dispose()
  })

  it('bounds standalone effect projection by declared tuple size', () => {
    const { sprite, vector } = makeOverflowFixture(makeTexture())
    pushOverflow(vector)

    sprite._writeEffectDataOwn()

    const buffer = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect([...buffer.subarray(0, 4)]).toEqual([1, 2, 77, 0])
  })

  it('bounds first-assignment effect projection by declared tuple size', () => {
    const { sprite, vector } = makeOverflowFixture(makeTexture())
    pushOverflow(vector)
    group = new SpriteGroup()

    group.add(sprite)
    group.update()

    expectSentinelRow(sprite)
  })

  it('bounds direct-sync and reassignment projection by declared tuple size', () => {
    const { sprite, vector } = makeOverflowFixture(makeTexture())
    group = new SpriteGroup()
    group.add(sprite)
    group.update()

    pushOverflow(vector)
    sprite.removeEffect(vector)
    sprite.addEffect(vector)
    expectSentinelRow(sprite)

    sprite.sortLayer = 1
    group.update()
    expectSentinelRow(sprite)
  })

  it('writes scalar and vector lanes to the current row after sort, reassignment, and slot reuse', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(PackedEffect)
    group = new SpriteGroup()

    const moving = new Sprite2D({ texture, material })
    const sibling = new Sprite2D({ texture, material })
    const effect = new PackedEffect()
    moving.addEffect(effect)
    moving.zIndex = 10
    sibling.zIndex = 0
    group.add(moving)
    group.add(sibling)
    group.update()

    // The initial sort moved `moving`; setters must target its new physical row.
    const readSpy = vi.spyOn(worldFor(group), 'read')
    const patchSpy = vi.spyOn(worldFor(group), 'patch')
    effect.scalar = 0.25
    effect.vector = [1, 2, 3, 4]
    expect(effect.scalar).toBe(0.25)
    const firstVectorRead = effect.vector
    expect(effect.vector).toBe(firstVectorRead)
    expect(readSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expectPackedRow(moving, 0.25, [1, 2, 3, 4])
    expect(() => effect._setField('vector', [99])).toThrow(/4 numeric components/)
    expectPackedRow(moving, 0.25, [1, 2, 3, 4])

    // Cross-run reassignment updates the cached mesh/slot before subsequent writes.
    moving.sortLayer = 1
    group.update()
    effect.scalar = 0.5
    effect.vector = [5, 6, 7, 8]
    expectPackedRow(moving, 0.5, [5, 6, 7, 8])

    const recycledMesh = moving._batchMesh
    const recycledSlot = moving._batchSlot
    group.remove(moving)
    group.update()

    const replacement = new Sprite2D({ texture, material })
    const replacementEffect = new PackedEffect()
    replacement.addEffect(replacementEffect)
    replacement.sortLayer = 1
    group.add(replacement)
    group.update()
    expect(replacement._batchMesh).toBe(recycledMesh)
    expect(replacement._batchSlot).toBe(recycledSlot)

    replacementEffect.scalar = 0.75
    replacementEffect.vector = [9, 10, 11, 12]
    expectPackedRow(replacement, 0.75, [9, 10, 11, 12])
  })

  it('defers direct writes while a material reassignment has mismatched effect layouts', () => {
    const texture = makeTexture()
    const sourceMaterial = new Sprite2DMaterial({ map: texture })
    sourceMaterial.registerEffect(PackedEffect)
    const destinationMaterial = new Sprite2DMaterial({ map: texture })
    destinationMaterial.registerEffect(PrefixEffect)
    destinationMaterial.registerEffect(PackedEffect)
    group = new SpriteGroup()

    const sprite = new Sprite2D({ texture, material: sourceMaterial })
    const effect = new PackedEffect()
    sprite.addEffect(effect)
    group.add(sprite)
    group.update()

    const sourceMesh = sprite._batchMesh!
    const sourceSlot = sprite._batchSlot
    const sourceBefore = sourceMesh.getCustomBuffer('effectBuf0')!.buffer.slice(sourceSlot * 4, sourceSlot * 4 + 4)

    sprite.material = destinationMaterial
    effect.scalar = 0.625
    effect.vector = [2, 4, 6, 8]

    expect([...sourceMesh.getCustomBuffer('effectBuf0')!.buffer.subarray(sourceSlot * 4, sourceSlot * 4 + 4)]).toEqual([
      ...sourceBefore,
    ])

    group.update()
    const destinationMesh = sprite._batchMesh!
    expect(destinationMesh).not.toBe(sourceMesh)
    const scalarSlot = destinationMesh.spriteMaterial._effectSlots.get(`${PackedEffect.effectName}_scalar`)!
    const vectorSlot = destinationMesh.spriteMaterial._effectSlots.get(`${PackedEffect.effectName}_vector`)!
    const scalarBuffer = destinationMesh.getCustomBuffer(`effectBuf${Math.floor(scalarSlot.offset / 4)}`)!.buffer
    expect(scalarBuffer[sprite._batchSlot * 4 + (scalarSlot.offset % 4)]).toBeCloseTo(0.625)
    for (let i = 0; i < 4; i++) {
      const offset = vectorSlot.offset + i
      const buffer = destinationMesh.getCustomBuffer(`effectBuf${Math.floor(offset / 4)}`)!.buffer
      expect(buffer[sprite._batchSlot * 4 + (offset % 4)]).toBe(2 + i * 2)
    }
  })

  it('preserves enrolled scalar/vector state through same-instance remove and re-add', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(PackedEffect)
    group = new SpriteGroup()
    const sprite = new Sprite2D({ texture, material })
    const effect = new PackedEffect()
    sprite.addEffect(effect)
    group.add(sprite)
    group.update()

    effect.scalar = 0.625
    effect.vector = [2, 4, 6, 8]
    expectPackedRow(sprite, 0.625, [2, 4, 6, 8])

    sprite.removeEffect(effect)
    sprite.addEffect(effect)

    const trait = worldFor(group).read(entityFor(sprite)!, traitFor(PackedEffect)) as Record<string, number>
    expect(trait).toMatchObject({ scalar: 0.625, vector_0: 2, vector_1: 4, vector_2: 6, vector_3: 8 })
    expect(effect.scalar).toBeCloseTo(0.625)
    expect(effect.vector).toEqual([2, 4, 6, 8])
    expectPackedRow(sprite, 0.625, [2, 4, 6, 8])
  })

  it('rebinds an attached effect after moving from world A through standalone state into world B', () => {
    const texture = makeTexture()
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(PackedEffect)
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()
    group = groupA
    extraGroups.push(groupB)
    const sprite = new Sprite2D({ texture, material })
    const effect = new PackedEffect()
    sprite.addEffect(effect)
    groupA.add(sprite)

    const worldA = worldFor(groupA)!
    const entityA = entityFor(sprite)!
    effect.scalar = 0.25
    expect(worldA.read(entityA, traitFor(PackedEffect))).toMatchObject({ scalar: 0.25 })

    // Leave A's deferred entity alive so an incorrect cached-store lookup can
    // observe its old row after B assigns the same entity slot.
    groupA.remove(sprite)
    effect.scalar = 0.75
    groupB.add(sprite)

    const worldB = worldFor(groupB)!
    const entityB = entityFor(sprite)!
    expect(entityB).toBe(entityA)
    expect(worldA.read(entityA, traitFor(PackedEffect))).toMatchObject({ scalar: 0.25 })
    expect(worldB.read(entityB, traitFor(PackedEffect))).toMatchObject({ scalar: 0.75 })
    expect(effect.scalar).toBeCloseTo(0.75)
  })

  it('immediately restores a cached constant-variant batch row on remove and re-add', () => {
    const texture = makeTexture()
    group = new SpriteGroup()
    const sprite = new Sprite2D({ texture })
    group.add(sprite)
    group.update()
    const effect = new ConstantVariantEffect()
    effect.scalar = 0.75
    sprite.addEffect(effect)
    group.update()
    const variantMaterial = sprite.material
    const mesh = sprite._batchMesh!
    const slot = sprite._batchSlot
    const effectSlot = variantMaterial._effectSlots.get(`${ConstantVariantEffect.effectName}_scalar`)!
    const effectBuffer = mesh.getCustomBuffer(`effectBuf${Math.floor(effectSlot.offset / 4)}`)!.buffer
    const interleaved = (mesh as unknown as { _interleavedData: Float32Array })._interleavedData

    sprite.removeEffect(effect)
    expect(interleaved[slot * 16 + 11]).toBe(0)

    sprite.addEffect(effect)

    expect(sprite.material).toBe(variantMaterial)
    expect(sprite._batchMesh).toBe(mesh)
    expect(interleaved[slot * 16 + 11]).toBe(1)
    expect(effectBuffer[slot * 4 + (effectSlot.offset % 4)]).toBeCloseTo(0.75)
  })
})
