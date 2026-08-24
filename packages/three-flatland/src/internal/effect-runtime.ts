import type { Entity, NumericSchema, NumericTrait } from '../ecs/runtime'

const values = new WeakMap<object, NumericTrait<NumericSchema> | Entity>()
const vectorSnapshots = new WeakMap<object, Record<string, readonly number[]>>()

interface VectorReadOverride {
  readonly name: string
  readonly size: number
  readonly c0: number
  readonly c1: number
  readonly c2: number
  readonly c3: number
}

const vectorReadOverrides = new WeakMap<object, VectorReadOverride>()

export function setEffectTrait(effectClass: Function, trait: NumericTrait<NumericSchema>): void {
  values.set(effectClass, trait)
}

export function getEffectTrait(effectClass: Function): NumericTrait<NumericSchema> {
  return values.get(effectClass) as NumericTrait<NumericSchema>
}

export function setEffectEntity(effect: object, entity: Entity | null): void {
  if (entity === null) values.delete(effect)
  else values.set(effect, entity)
}

export function getEffectEntity(effect: object): Entity | null {
  return (values.get(effect) as Entity | undefined) ?? null
}

/**
 * Return the current immutable vector snapshot, or replace it when any
 * component changed. Snapshot records are created lazily on the first vector
 * read; setters never touch this cache.
 * @internal
 */
export function readEffectVectorSnapshot(
  effect: object,
  name: string,
  size: number,
  c0: number,
  c1: number,
  c2 = 0,
  c3 = 0
): readonly number[] {
  const override = vectorReadOverrides.get(effect)
  if (override?.name === name) {
    size = override.size
    c0 = override.c0
    c1 = override.c1
    c2 = override.c2
    c3 = override.c3
  }

  let snapshots = vectorSnapshots.get(effect)
  const current = snapshots?.[name]
  if (
    current &&
    Object.is(current[0], c0) &&
    Object.is(current[1], c1) &&
    (size < 3 || Object.is(current[2], c2)) &&
    (size < 4 || Object.is(current[3], c3))
  ) {
    return current
  }

  if (!snapshots) {
    snapshots = Object.create(null) as Record<string, readonly number[]>
    vectorSnapshots.set(effect, snapshots)
  }
  const snapshot = Object.freeze(size === 2 ? [c0, c1] : size === 3 ? [c0, c1, c2] : [c0, c1, c2, c3])
  snapshots[name] = snapshot
  return snapshot
}

/** Publish a prior committed vector value while a transactional write prepares. @internal */
export function beginEffectVectorReadOverride(
  effect: object,
  name: string,
  size: number,
  c0: number,
  c1: number,
  c2 = 0,
  c3 = 0
): VectorReadOverride | undefined {
  const previous = vectorReadOverrides.get(effect)
  vectorReadOverrides.set(effect, { name, size, c0, c1, c2, c3 })
  return previous
}

/** Restore the enclosing transactional read state. @internal */
export function restoreEffectVectorReadOverride(effect: object, previous: VectorReadOverride | undefined): void {
  if (previous) vectorReadOverrides.set(effect, previous)
  else vectorReadOverrides.delete(effect)
}
