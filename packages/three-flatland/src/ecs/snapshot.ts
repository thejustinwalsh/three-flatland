import { entityIndex, type NumericTrait, type NumericSchema, type NumericStore, type World } from './runtime'

/** Resolve the dense storage index encoded in a Flatland entity handle. */
export const entitySlot = entityIndex

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
