import type { Entity, Trait } from 'koota'

/** Read trait data — from entity if enrolled, snapshot fallback otherwise. */
export function readTrait<V>(entity: Entity | null, trait: Trait, fallback: V): V {
  if (entity) return entity.get(trait) as V
  return fallback
}

/** Write trait data — to entity if enrolled, snapshot fallback otherwise. */
export function writeTrait<V>(
  entity: Entity | null,
  trait: Trait,
  fallback: V,
  values: Partial<V>
): void {
  if (entity) entity.set(trait, values as any)
  else Object.assign(fallback as any, values)
}
