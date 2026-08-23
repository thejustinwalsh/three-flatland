export { entityGeneration, entityIndex, type Entity, type EntityHandle } from './entity'
export type { TraitHandle, WorldHandle } from '../../internal/ecs-handles'
export {
  added,
  changed,
  removed,
  select,
  type ChangedSelectorOptions,
  type EventSelector,
  type Selector,
} from './selector'
export {
  trait,
  type AnyTrait,
  type NumericSchema,
  type NumericStore,
  type NumericTrait,
  type NumericUpdate,
  type ObjectTrait,
  type TagTrait,
  type Trait,
  type TraitInitializer,
  type TraitInput,
  type WidenNumericSchema,
} from './trait'
export { createWorld, type World, type WorldOptions } from './world'
