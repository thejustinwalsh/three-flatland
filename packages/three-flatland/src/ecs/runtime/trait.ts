export type NumericSchema = Readonly<Record<string, number>>

export type WidenNumericSchema<TSchema extends NumericSchema> = {
  [TKey in keyof TSchema]: number
}

export type NumericStore<TSchema extends NumericSchema> = {
  readonly [TKey in keyof TSchema]: number[]
}

export type NumericUpdate<TSchema extends NumericSchema, TInput extends object> = TInput & {
  readonly [TKey in keyof TInput]: TKey extends keyof TSchema
    ? TInput[TKey] extends number
      ? TInput[TKey]
      : never
    : never
}

export type TraitKind = 'numeric' | 'object' | 'tag'

declare const traitValue: unique symbol
declare const traitKind: unique symbol
declare const traitInitializerBrand: unique symbol

export interface Trait<TValue = unknown, TKind extends TraitKind = TraitKind> {
  readonly id: number
  readonly kind: TKind
  readonly [traitValue]: TValue
  readonly [traitKind]: TKind
}

export interface TraitInitializer<TValue extends object = object> {
  readonly trait: Trait<TValue>
  readonly initial?: Partial<TValue>
  readonly [traitInitializerBrand]: true
}

export interface NumericTrait<TSchema extends NumericSchema> extends Trait<TSchema, 'numeric'> {
  (): TraitInitializer<TSchema>
  <TInitial extends object>(initial: NumericUpdate<TSchema, TInitial>): TraitInitializer<TSchema>
  readonly defaults: TSchema
  readonly fields: readonly (keyof TSchema & string)[]
}

export interface ObjectTrait<TValue extends object> extends Trait<TValue, 'object'> {
  (initial?: Partial<TValue>): TraitInitializer<TValue>
  readonly factory: () => TValue
}

export interface TagTrait extends Trait<undefined, 'tag'> {}

export type AnyTrait = Trait<unknown>

export type InitializerMetadata = TraitInitializer<object>

export type TraitInput = AnyTrait | TraitInitializer<object>

let nextTraitId = 0

export function numericDataSnapshot(value: object): Record<string, number> | undefined {
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined

  const snapshot: Record<string, number> = {}
  for (const field of Reflect.ownKeys(value)) {
    if (typeof field !== 'string') return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, field)
    if (descriptor?.enumerable !== true || !('value' in descriptor) || typeof descriptor.value !== 'number') {
      return undefined
    }
    Object.defineProperty(snapshot, field, {
      enumerable: true,
      value: descriptor.value,
    })
  }
  return snapshot
}

export function trait(): TagTrait
export function trait<TSchema extends NumericSchema>(
  defaults: TSchema & Record<Extract<keyof TSchema, symbol>, never>
): NumericTrait<WidenNumericSchema<TSchema>>
export function trait<TValue extends object>(factory: () => TValue): ObjectTrait<TValue>
export function trait<TValue extends object>(
  definition?: NumericSchema | (() => TValue)
): TagTrait | NumericTrait<NumericSchema> | ObjectTrait<TValue> {
  const id = nextTraitId++

  if (definition === undefined) {
    return Object.freeze({ id, kind: 'tag' }) as unknown as TagTrait
  }

  if (typeof definition === 'function') {
    const handle = ((initial?: Partial<TValue>) => ({
      trait: handle,
      initial,
    })) as unknown as ObjectTrait<TValue>
    Object.defineProperties(handle, {
      factory: { value: definition },
      id: { value: id },
      kind: { value: 'object' },
    })
    return handle
  }

  const defaults = numericDataSnapshot(definition)
  if (defaults === undefined) {
    throw new TypeError('three-flatland: Numeric traits accept only flat number fields')
  }

  Object.freeze(defaults)
  const stableFields = Object.freeze(Object.keys(defaults))
  const handle = ((initial?: Partial<NumericSchema>) => ({
    trait: handle,
    initial,
  })) as unknown as NumericTrait<NumericSchema>
  Object.defineProperties(handle, {
    defaults: { value: defaults },
    fields: { value: stableFields },
    id: { value: id },
    kind: { value: 'numeric' },
  })
  return handle
}

export function isInitializer(input: TraitInput): input is InitializerMetadata {
  return typeof input === 'object' && input !== null && 'trait' in input
}

export function inputTrait(input: TraitInput): AnyTrait {
  return isInitializer(input) ? input.trait : input
}
