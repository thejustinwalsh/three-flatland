import type { SpriteBatch } from '../pipeline/SpriteBatch'
import type { Sprite2D } from '../sprites/Sprite2D'

/**
 * Private friend surface for the ECS systems that own SpriteBatch rows.
 *
 * Kept outside SpriteBatch's public declaration surface: callers obtain the
 * access object once per batch, while the hot per-member loops stay direct and
 * allocation-free.
 */
export interface SpriteBatchOwnership {
  slotSpan(): number
  readonly slotEntities: readonly number[]
  spriteAtSlot(slot: number): Sprite2D | null
  memberSpan(): number
  readonly memberSprites: readonly (Sprite2D | null)[]
  memberSlotAt(member: number): number
  swapSlots(a: number, b: number): void
  assertSlotOwner(index: number, expectedEntity: number): void
  reserveSlot(): number
  commitSlot(index: number, entity: number, sprite: Sprite2D): void
  rollbackSlot(index: number): void
  releaseSlot(index: number, expectedEntity: number): void
  hideSlot(index: number): void
  resetSlots(): void
}

const ownershipByBatch = new WeakMap<SpriteBatch, SpriteBatchOwnership>()

export function registerSpriteBatchOwnership(batch: SpriteBatch, ownership: SpriteBatchOwnership): void {
  if (ownershipByBatch.has(batch)) {
    throw new Error('three-flatland: SpriteBatch ownership access is already registered')
  }
  ownershipByBatch.set(batch, ownership)
}

export function getSpriteBatchOwnership(batch: SpriteBatch): SpriteBatchOwnership {
  const ownership = ownershipByBatch.get(batch)
  if (!ownership) throw new Error('three-flatland: SpriteBatch ownership access is unavailable')
  return ownership
}
