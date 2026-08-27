import type { Entity, NumericSchema, NumericTrait } from '../ecs/runtime'

const values = new WeakMap<object, NumericTrait<NumericSchema> | Entity>()
const vectorSnapshots = new WeakMap<object, Record<string, readonly number[]>>()

interface EffectReadOverrideState {
  depth: number
  name0: string
  size0: number
  c00: number
  c01: number
  c02: number
  c03: number
  name1: string
  size1: number
  c10: number
  c11: number
  c12: number
  c13: number
}

const effectReadOverrides = new WeakMap<object, EffectReadOverrideState>()

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
  const override = effectReadOverrides.get(effect)
  const nested = override?.depth === 2
  const overrideName = override && override.depth > 0 ? (nested ? override.name1 : override.name0) : undefined
  if (overrideName === name) {
    size = nested ? override.size1 : override!.size0
    c0 = nested ? override.c10 : override!.c00
    c1 = nested ? override.c11 : override!.c01
    c2 = nested ? override.c12 : override!.c02
    c3 = nested ? override.c13 : override!.c03
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

/** Return the prior committed scalar while a transactional write prepares. @internal */
export function readEffectScalarValue(effect: object, name: string, value: number): number {
  const override = effectReadOverrides.get(effect)
  if (!override || override.depth === 0) return value
  const nested = override.depth === 2
  const overrideName = nested ? override.name1 : override.name0
  return overrideName === name ? (nested ? override.c10 : override.c00) : value
}

/**
 * Publish a prior committed numeric value while a transactional write prepares.
 * The first transaction creates two fixed frames; steady writes only mutate
 * that retained state, including the one reentrant frame TileMap2D can reach.
 * @internal
 */
export function beginEffectReadOverride(
  effect: object,
  name: string,
  size: number,
  c0: number,
  c1 = 0,
  c2 = 0,
  c3 = 0
): object {
  let state = effectReadOverrides.get(effect)
  if (!state) {
    state = {
      depth: 0,
      name0: '',
      size0: 0,
      c00: 0,
      c01: 0,
      c02: 0,
      c03: 0,
      name1: '',
      size1: 0,
      c10: 0,
      c11: 0,
      c12: 0,
      c13: 0,
    }
    effectReadOverrides.set(effect, state)
  }

  if (state.depth >= 2) {
    throw new Error('Effect read override exceeded the supported TileMap2D projection nesting depth')
  }

  if (state.depth === 0) {
    state.name0 = name
    state.size0 = size
    state.c00 = c0
    state.c01 = c1
    state.c02 = c2
    state.c03 = c3
  } else {
    // TileMap2D rejects a reentrant projection before it can invoke user code,
    // so one fixed nested frame covers the only possible recursion depth.
    state.name1 = name
    state.size1 = size
    state.c10 = c0
    state.c11 = c1
    state.c12 = c2
    state.c13 = c3
  }
  state.depth++
  return state
}

/** Restore the enclosing transactional read state. @internal */
export function restoreEffectReadOverride(effect: object): void {
  const state = effectReadOverrides.get(effect)
  if (state && state.depth > 0) state.depth--
}
