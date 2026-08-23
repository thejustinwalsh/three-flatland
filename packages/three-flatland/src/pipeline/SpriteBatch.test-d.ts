import { describe, it } from 'vitest'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteBatch } from './SpriteBatch'

describe('SpriteBatch public declaration boundary', () => {
  it('does not expose physical-row ownership internals', () => {
    const assertPrivate = (batch: SpriteBatch, sprite: Sprite2D) => {
      // Removed legacy allocation API.
      // @ts-expect-error physical row allocation is internal
      batch.allocateSlot()
      // @ts-expect-error physical row release is internal
      batch.freeSlot(0)

      // Current transactional ownership API.
      // @ts-expect-error physical row reservation is internal
      batch.reserveSlot()
      // @ts-expect-error physical row publication is internal
      batch.commitSlot(0, 1, sprite)
      // @ts-expect-error physical row rollback is internal
      batch.rollbackSlot(0)
      // @ts-expect-error physical row ownership assertions are internal
      batch.assertSlotOwner(0, 1)
      // @ts-expect-error physical row release is internal
      batch.releaseSlot(0, 1)
      // @ts-expect-error physical row permutation is internal
      batch.swapSlots(0, 1)
      // @ts-expect-error pooled ownership reset is internal
      batch.resetSlots()

      // Packed handle and traversal tables.
      // @ts-expect-error packed entity handles are internal
      void batch.slotEntities
      // @ts-expect-error physical row span is internal
      void batch.slotSpan
      // @ts-expect-error packed sprite members are internal
      void batch.memberSprites
      // @ts-expect-error packed member span is internal
      void batch.memberSpan
      // @ts-expect-error physical-slot indirection is internal
      batch.memberSlotAt(0)
      // @ts-expect-error physical row ownership lookup is internal
      batch.spriteAtSlot(0)
      // @ts-expect-error deferred-row hiding is internal
      batch.hideSlot(0)
    }

    void assertPrivate
  })
})
