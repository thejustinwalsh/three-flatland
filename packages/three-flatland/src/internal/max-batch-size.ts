import { ENTITY_INDEX_STRIDE } from '../ecs/runtime/entity'

/**
 * A batch cannot contain more sprites than a world can allocate entity
 * indices. Keeping the cap aligned with the runtime's 20-bit index space also
 * bounds every per-instance CPU/GPU allocation derived from this value.
 */
export const MAX_BATCH_SIZE = ENTITY_INDEX_STRIDE

/** Validate user-controlled batch capacity before any state or storage changes. */
export function validateMaxBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_BATCH_SIZE) {
    throw new RangeError(
      `three-flatland: maxBatchSize must be a positive safe integer no greater than ${MAX_BATCH_SIZE}`
    )
  }
  return value
}
