import { ENTITY_INDEX_STRIDE } from '../ecs/runtime/entity'

// Types build-time environment reads without requiring @types/node.
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

export type CapacityGrowthReason = 'growth' | 'hint'

export interface CapacityGrowthEvent {
  readonly subsystem: string
  readonly previous: number
  readonly next: number
  readonly reason: CapacityGrowthReason
}

type CapacityObserver = (event: CapacityGrowthEvent) => void

const _capacityObservers =
  process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'
    ? new WeakMap<object, CapacityObserver>()
    : null
const _capacityHistory = _capacityObservers ? new WeakMap<object, CapacityGrowthEvent[]>() : null

/** @internal Test/devtools seam. Production builds fold the observer map away. */
export function observeCapacityGrowth(owner: object, observer: CapacityObserver): () => void {
  _capacityObservers?.set(owner, observer)
  for (const event of _capacityHistory?.get(owner) ?? []) observer(event)
  _capacityHistory?.delete(owner)
  return () => _capacityObservers?.delete(owner)
}

export function emitCapacityGrowth(owner: object | undefined, event: CapacityGrowthEvent): void {
  if (owner === undefined) return
  const observer = _capacityObservers?.get(owner)
  if (observer !== undefined) {
    observer(event)
    return
  }
  if (_capacityHistory !== null) {
    let history = _capacityHistory.get(owner)
    if (history === undefined) {
      history = []
      _capacityHistory.set(owner, history)
    }
    history.push(event)
  }
}

export function validateExpectedSprites(value: number | undefined): number {
  const expectedSprites = value ?? 0
  if (!Number.isSafeInteger(expectedSprites) || expectedSprites < 0) {
    throw new RangeError('three-flatland: expectedSprites must be a non-negative safe integer')
  }
  return expectedSprites
}

/** The entity runtime remains the only intrinsic capacity limit. The hint itself is not a cap. */
export function clampEntityReservation(value: number): number {
  return Math.min(value, ENTITY_INDEX_STRIDE)
}

/** Geometric growth keeps any one expansion below 2x the previous reservation. */
export function nextCapacity(current: number, required: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (required <= current) return current
  let next = current === 0 ? Math.min(maximum, 16) : current
  while (next < required) next = Math.min(maximum, Math.max(required, next * 2))
  return next
}

/**
 * Reserve index-addressed storage while keeping the same array reference.
 * The logical length intentionally remains at the reservation because every
 * index has a harmless absence/default value.
 */
export function reserveIndexedArray<T>(values: T[], capacity: number, fill: T): void {
  for (let index = values.length; index < capacity; index++) values.push(fill)
}

/**
 * Best-effort dense-array reservation. JavaScript exposes no portable reserve
 * primitive, so this primes current engines without changing logical length.
 * Correctness never relies on the engine retaining this backing capacity.
 */
export function primeDenseArray<T>(values: T[], capacity: number, fill: T): void {
  const length = values.length
  for (let index = length; index < capacity; index++) values.push(fill)
  values.length = length
}
