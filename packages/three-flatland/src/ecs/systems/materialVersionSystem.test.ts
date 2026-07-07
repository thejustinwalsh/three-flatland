import { describe, it, expect, afterEach, vi } from 'vitest'
import { Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../../sprites/Sprite2D'
import { Sprite2DMaterial } from '../../materials/Sprite2DMaterial'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { createMaterialEffect } from '../../materials/MaterialEffect'
import { materialVersionSystem } from './materialVersionSystem'
import { BatchSlot, BatchMesh, InBatch } from '../traits'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
  return texture
}

describe('materialVersionSystem', () => {
  afterEach(() => {
    universe.reset()
  })

  // Regression guard: the standalone materialVersionSystem export used to
  // carry its own copy of the eviction logic that freed the batch slot
  // read off the InBatch relation — a pure membership tag with no slot
  // payload (see traits.ts), so that read was always `undefined`. The
  // live slot lives on BatchSlot, kept in sync by batchSortSystem on
  // every swap. Now materialVersionSystem delegates to
  // evictBatchesForMaterial, which reads BatchSlot.
  it('evicts using the LIVE BatchSlot after a sort swap, not the stale InBatch relation', () => {
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

    const slotABefore = a.entity!.get(BatchSlot)!.slot
    const slotBBefore = b.entity!.get(BatchSlot)!.slot
    expect(slotBBefore).toBeLessThan(slotABefore)

    // Flip zIndex so a sorts before b — batchSortSystem swaps their
    // physical slots and updates BatchSlot; InBatch is never touched.
    a.zIndex = 0
    group.update()

    const slotAAfter = a.entity!.get(BatchSlot)!.slot
    const slotBAfter = b.entity!.get(BatchSlot)!.slot
    expect(slotAAfter).toBe(slotBBefore) // proves the physical swap happened
    expect(slotBAfter).toBe(slotABefore)

    const batchEntity = a.entity!.targetFor(InBatch)!
    const mesh = batchEntity.get(BatchMesh)!.mesh as SpriteBatch
    const freeSlotSpy = vi.spyOn(mesh, 'freeSlot')

    // Bump the material's effect schema version so materialVersionSystem
    // detects the mismatch and evicts every sprite using it.
    const Glow = createMaterialEffect({
      name: 'materialVersionRegressionGlow',
      schema: { intensity: 1 },
      node: ({ inputColor }) => inputColor,
    })
    material.registerEffect(Glow)

    materialVersionSystem(group.world)

    // The CURRENT (post-swap) slots were freed...
    expect(freeSlotSpy).toHaveBeenCalledWith(slotAAfter)
    expect(freeSlotSpy).toHaveBeenCalledWith(slotBAfter)
    // ...never the stale InBatch relation (which carries no slot at all).
    expect(freeSlotSpy).not.toHaveBeenCalledWith(undefined)

    // evictBatchesForMaterial (unlike the deleted duplicate) also clears
    // each sprite's cached direct-write refs.
    expect(a._batchMesh).toBeNull()
    expect(b._batchMesh).toBeNull()

    freeSlotSpy.mockRestore()
    group.dispose()
  })
})
