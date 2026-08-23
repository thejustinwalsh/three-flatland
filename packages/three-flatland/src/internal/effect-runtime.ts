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
