import { ENTITY_INDEX_STRIDE } from '../ecs/runtime/entity'
import { fail } from '../ecs/runtime/error'

export function validateExpectedSprites(value: number | undefined): number {
  const expectedSprites = value ?? 0
  if (!Number.isSafeInteger(expectedSprites) || expectedSprites < 0) {
    fail('expectedSprites must be a non-negative safe integer', RangeError)
  }
  return expectedSprites
}

/** The entity runtime remains the only intrinsic capacity limit. The hint itself is not a cap. */
export function clampEntityReservation(value: number): number {
  return Math.min(value, ENTITY_INDEX_STRIDE)
}

/** Grow geometrically, or directly to a larger required capacity. */
export function nextCapacity(current: number, required: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (required > maximum) fail('Required capacity exceeds intrinsic maximum', RangeError)
  if (required <= current) return current
  return Math.min(maximum, Math.max(required, current === 0 ? 16 : current * 2))
}

/**
 * Reserve index-addressed storage while keeping the same array reference.
 * The logical length intentionally remains at the reservation because every
 * index has a harmless absence/default value.
 */
export function reserveIndexedArray<T>(values: T[], capacity: number, fill: T): void {
  if (capacity > values.length) values.fill(fill, values.length, (values.length = capacity))
}
