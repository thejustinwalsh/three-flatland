/**
 * The behavioral surface Flatland needs from an entity store.
 *
 * This deliberately describes Flatland semantics instead of mirroring Koota's
 * API. Koota and every candidate kernel implement this contract so the same
 * deterministic scenarios can exercise each runtime.
 */

/** Numeric handle whose identity is meaningful only within its owning world. */
export type Entity = number

export type NumericSchema = Readonly<Record<string, number>>

export type NumericStore<TSchema extends NumericSchema> = {
  readonly [TKey in keyof TSchema]: NumericField
}

export interface NumericField extends ArrayLike<number> {
  [index: number]: number
}

declare const traitValue: unique symbol
declare const traitKind: unique symbol

export type TraitKind = 'numeric' | 'object' | 'tag'

/** Opaque, adapter-owned trait handle with compile-time value information. */
export interface Trait<TValue, TKind extends TraitKind = TraitKind> {
  readonly [traitValue]?: TValue
  readonly [traitKind]?: TKind
}

export type AnyTrait = Trait<unknown>
export type NumericTrait<TSchema extends NumericSchema> = Trait<TSchema, 'numeric'>
export type ObjectTrait<TValue extends object> = Trait<TValue, 'object'>
export type TagTrait = Trait<undefined, 'tag'>

export interface Component<TValue = unknown> {
  readonly trait: Trait<TValue>
  readonly initial?: Partial<TValue>
}

export function component<TValue>(trait: Trait<TValue>, initial?: Partial<TValue>): Component<TValue> {
  return initial === undefined ? { trait } : { trait, initial }
}

export interface Selector {
  readonly id: number
}

export type EventKind = 'added' | 'changed' | 'removed'

export interface EventSelector {
  readonly id: number
}

/**
 * Test-only abstraction for Flatland's one exclusive sprite-to-batch edge.
 * Candidate kernels may back this with a direct BatchSlot field rather than a
 * general relation engine.
 */
export interface ExclusiveRelation {
  readonly id: number
}

export interface AdapterWorld {
  readonly disposed: boolean

  spawn(...components: readonly Component[]): Entity
  add<TValue>(entity: Entity, value: Component<TValue>): void
  remove(entity: Entity, trait: AnyTrait): void
  has(entity: Entity, trait: AnyTrait): boolean
  read<TValue>(entity: Entity, trait: Trait<TValue>): TValue | undefined
  patch<TValue extends object>(entity: Entity, trait: Trait<TValue>, value: Partial<TValue>, tracked?: boolean): void
  store<TSchema extends NumericSchema>(trait: NumericTrait<TSchema>): NumericStore<TSchema>

  /**
   * Borrowed internal view, valid until the next world mutation or the next
   * `view` call for the same selector. Callers must not retain or mutate it.
   */
  view(selector: Selector): readonly Entity[]
  drain(selector: EventSelector): readonly Entity[]

  assign(entity: Entity, relation: ExclusiveRelation, target: Entity): void
  unassign(entity: Entity, relation: ExclusiveRelation): void
  target(entity: Entity, relation: ExclusiveRelation): Entity | undefined

  destroy(entity: Entity): void
  isAlive(entity: Entity): boolean
  index(entity: Entity): number
  generation(entity: Entity): number
  dispose(): void
}

export interface EcsAdapter {
  readonly name: string

  numeric<TSchema extends NumericSchema>(defaults: TSchema): NumericTrait<TSchema>
  object<TValue extends object>(factory: () => TValue): ObjectTrait<TValue>
  tag(): TagTrait
  exclusive(): ExclusiveRelation

  select(...required: readonly AnyTrait[]): Selector
  event(kind: EventKind, observed: readonly AnyTrait[], required?: readonly AnyTrait[]): EventSelector

  createWorld(): AdapterWorld

  /** Reset adapter-global test state. Production candidates should be a no-op. */
  reset(): void
}
