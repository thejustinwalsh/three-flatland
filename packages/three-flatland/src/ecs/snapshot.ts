import { getStore, universe, type Entity, type Trait } from 'koota'

// Koota entity bit-packing constants (stable across versions)
export const ENTITY_ID_MASK = (1 << 20) - 1
const WORLD_ID_SHIFT = 28

/** Read trait data — from entity if enrolled, snapshot fallback otherwise. */
export function readTrait<V>(entity: Entity | null, trait: Trait, fallback: V): V {
  if (entity) return entity.get(trait) as V
  return fallback
}

/**
 * Read a single SoA field directly from the store — zero allocation.
 * Bypasses entity.get() which allocates a new object per call.
 * Use for hot-path reads (e.g. per-frame per-entity in updateMatrix).
 */
export function readField(
  entity: Entity | null,
  trait: Trait,
  field: string,
  fallback: number
): number {
  if (entity) {
    const world = universe.worlds[(entity as number) >>> WORLD_ID_SHIFT]!
    const store = getStore(world, trait) as Record<string, number[]>
    return store[field]![(entity as number) & ENTITY_ID_MASK]!
  }
  return fallback
}

/**
 * Write trait data — to entity if enrolled, snapshot fallback otherwise.
 * Pass triggerChanged=false for traits with no Changed() observers to skip change detection.
 */
export function writeTrait<V>(
  entity: Entity | null,
  trait: Trait,
  fallback: V,
  values: Partial<V>,
  triggerChanged = true
): void {
  if (entity) entity.set(trait, values, triggerChanged)
  else Object.assign(fallback as object, values)
}
