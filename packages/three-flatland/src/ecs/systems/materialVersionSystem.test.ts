import { worldFor } from '../testUtils.type-test'
import { describe, it, expect, vi } from 'vitest'
import { Texture } from 'three'
import { Sprite2D } from '../../sprites/Sprite2D'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { materialVersionSystem } from './materialVersionSystem'
import { BatchSlot, IsBatched } from '../traits'
import { batchFor, readRequired, requiredEntity } from '../testUtils.type-test'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
  return texture
}

describe('materialVersionSystem', () => {
  // Regression guard: the standalone materialVersionSystem export used to
  // carry its own copy of the eviction logic that freed the batch slot
  // read off the deleted relation target. The complete owner + live slot now
  // live together on BatchSlot and are updated atomically by sorting.
  it('evicts using the live BatchSlot ownership after a sort swap', () => {
    const texture = makeTexture()
    // effectTier: 0 (below the default 8) so registering even a
    // single-float effect below forces a tier upgrade and bumps
    // _effectSchemaVersion.
    const material = new Sprite2DMaterial({ map: texture, effectTier: 0 })
    const group = new SpriteGroup()

    const a = new Sprite2D({ texture, material })
    const b = new Sprite2D({ texture, material })
    a.zIndex = 10
    b.zIndex = 5
    group.add(a)
    group.add(b)
    group.update() // initial assign + sort: b (z=5) before a (z=10)

    const entityA = requiredEntity(a)
    const entityB = requiredEntity(b)
    const slotABefore = readRequired(worldFor(group), entityA, BatchSlot).slot
    const slotBBefore = readRequired(worldFor(group), entityB, BatchSlot).slot
    expect(slotBBefore).toBeLessThan(slotABefore)

    // Flip zIndex so a sorts before b — batchSortSystem swaps their
    // physical slots and updates the complete BatchSlot ownership record.
    a.zIndex = 0
    group.update()

    const slotAAfter = readRequired(worldFor(group), entityA, BatchSlot).slot
    const slotBAfter = readRequired(worldFor(group), entityB, BatchSlot).slot
    expect(slotAAfter).toBe(slotBBefore) // proves the physical swap happened
    expect(slotBAfter).toBe(slotABefore)

    const mesh = batchFor(worldFor(group), a)
    const releaseSlotSpy = vi.spyOn(getSpriteBatchOwnership(mesh), 'releaseSlot')

    // Bump the material's effect schema version so materialVersionSystem
    // detects the mismatch and evicts every sprite using it.
    const Glow = createMaterialEffect({
      name: 'materialVersionRegressionGlow',
      schema: { intensity: 1 },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(Glow)

    materialVersionSystem(worldFor(group))

    // The CURRENT (post-swap) slots were freed...
    expect(releaseSlotSpy).toHaveBeenCalledWith(slotAAfter, entityA)
    expect(releaseSlotSpy).toHaveBeenCalledWith(slotBAfter, entityB)
    // ...never an absent ownership slot.
    expect(releaseSlotSpy.mock.calls.every(([slot, owner]) => slot !== undefined && owner !== undefined)).toBe(true)

    // evictBatchesForMaterial (unlike the deleted duplicate) also clears
    // each sprite's cached direct-write refs.
    expect(a._batchMesh).toBeNull()
    expect(b._batchMesh).toBeNull()

    // Eviction re-triggers IsRenderable on the same entities. The queued
    // Removed event must not retire those live survivors on the next frame.
    group.update()
    group.update()
    expect(worldFor(group).isAlive(entityA)).toBe(true)
    expect(worldFor(group).isAlive(entityB)).toBe(true)
    expect(worldFor(group).has(entityA, IsBatched)).toBe(true)
    expect(worldFor(group).has(entityB, IsBatched)).toBe(true)

    releaseSlotSpy.mockRestore()
    group.dispose()
  })
})
