import type { Entity, NumericSchema, NumericTrait } from '../ecs/runtime'

const values = new WeakMap<object, NumericTrait<NumericSchema> | Entity>()

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
 * component changed. The common unchanged read performs no allocation.
 * @internal
 */
export function memoizeEffectVector(
  defaults: Record<string, number | readonly number[]>,
  name: string,
  size: number,
  c0: number,
  c1: number,
  c2 = 0,
  c3 = 0
): readonly number[] {
  const current = defaults[name] as readonly number[]
  if (
    Object.isFrozen(current) &&
    Object.is(current[0], c0) &&
    Object.is(current[1], c1) &&
    (size < 3 || Object.is(current[2], c2)) &&
    (size < 4 || Object.is(current[3], c3))
  ) {
    return current
  }

  const snapshot = Object.freeze(size === 2 ? [c0, c1] : size === 3 ? [c0, c1, c2] : [c0, c1, c2, c3])
  defaults[name] = snapshot
  return snapshot
}
