import {
  entityIndex,
  type Entity,
  type NumericTrait,
  type NumericSchema,
  type NumericStore,
  type World,
} from './runtime'

/** Resolve the dense storage index encoded in a Flatland entity handle. */
export const entitySlot = entityIndex

/** Decode a packed numeric handle stored in a trait, rejecting holes and stale generations. */
export function liveStoredEntity(world: World, value: number): Entity | null {
  if (!Number.isSafeInteger(value) || value === 0) return null
  const entity = value as Entity
  return world.isAlive(entity) ? entity : null
}

/**
 * Resolve SoA store arrays for a trait in a world.
 * Returns a record mapping field names to their backing number[] arrays.
 * These references are stable for the lifetime of the world.
 */
export function resolveStore<TSchema extends NumericSchema>(
  world: World,
  trait: NumericTrait<TSchema>
): NumericStore<TSchema> {
  return world.store(trait)
}
