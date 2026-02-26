import { getStore, type World, type Trait } from 'koota'

// Koota entity bit-packing constants (stable across versions)
export const ENTITY_ID_MASK = (1 << 20) - 1

/**
 * Resolve SoA store arrays for a trait in a world.
 * Returns a record mapping field names to their backing number[] arrays.
 * These references are stable for the lifetime of the world.
 */
export function resolveStore(world: World, trait: Trait): Record<string, number[]> {
  return getStore(world, trait) as Record<string, number[]>
}
