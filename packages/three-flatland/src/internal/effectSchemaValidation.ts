const MATERIAL_INSTANCE_FIELDS = new Set([
  'id',
  'name',
  '_sprite',
  '_entity',
  '_numericStore',
  '_storeWorld',
  '_defaults',
  '_constants',
])

const LIGHT_INSTANCE_FIELDS = new Set([
  'name',
  '_flatland',
  '_entity',
  '_numericStore',
  '_storeWorld',
  '_defaults',
  '_constants',
  '_uniforms',
  '_lightFn',
  '_enabled',
  '_resolutionScale',
  '_initialized',
  '_dirty',
  '_onDirty',
])

const PASS_INSTANCE_FIELDS = new Set([
  'name',
  '_flatland',
  '_entity',
  '_numericStore',
  '_storeWorld',
  '_defaults',
  '_constants',
  '_uniforms',
  '_passFn',
  '_order',
  '_enabled',
])

export type EffectSchemaKind = 'MaterialEffect' | 'LightEffect' | 'PassEffect'
export type ValidatedEffectSchemaEntry = readonly [
  fieldName: string,
  value: number | readonly number[] | (() => unknown),
]

const reservedByKind: Readonly<Record<EffectSchemaKind, ReadonlySet<string>>> = {
  MaterialEffect: MATERIAL_INSTANCE_FIELDS,
  LightEffect: LIGHT_INSTANCE_FIELDS,
  PassEffect: PASS_INSTANCE_FIELDS,
}

/** Validate user keys before any static metadata is committed. @internal */
export function validateEffectSchema(
  kind: EffectSchemaKind,
  effectName: string,
  schema: Readonly<Record<string, unknown>>,
  prototype: object
): ValidatedEffectSchemaEntry[] {
  const flattenedOwners = new Map<string, string>()
  const entries: ValidatedEffectSchemaEntry[] = []

  for (const [fieldName, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(schema))) {
    if (!descriptor.enumerable) continue
    if (reservedByKind[kind].has(fieldName) || fieldName in prototype) {
      throw new Error(
        `${kind} '${effectName}' schema field '${fieldName}' conflicts with an instance property or method`
      )
    }
    if (!('value' in descriptor)) {
      throw new TypeError(
        `${kind} '${effectName}' schema field '${fieldName}' must be an own data property; accessors are not supported`
      )
    }
    const value = descriptor.value
    if (typeof value === 'function') {
      entries.push([fieldName, value as () => unknown])
      continue
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError(`${kind} '${effectName}' schema field '${fieldName}' must be a finite number`)
      }
    } else {
      if (!Array.isArray(value) || value.length < 2 || value.length > 4) {
        throw new TypeError(
          `${kind} '${effectName}' schema field '${fieldName}' must be a numeric tuple of length 2 to 4`
        )
      }
      for (const component of value) {
        if (typeof component !== 'number' || !Number.isFinite(component)) {
          throw new TypeError(
            `${kind} '${effectName}' schema field '${fieldName}' must contain only finite numeric components`
          )
        }
      }
    }

    const size = typeof value === 'number' ? 1 : value.length
    for (let i = 0; i < size; i++) {
      const flattened = size === 1 ? fieldName : `${fieldName}_${i}`
      const owner = flattenedOwners.get(flattened)
      if (owner !== undefined) {
        throw new Error(
          `${kind} '${effectName}' schema fields '${owner}' and '${fieldName}' both flatten to '${flattened}'`
        )
      }
      flattenedOwners.set(flattened, fieldName)
    }
    entries.push([fieldName, typeof value === 'number' ? value : Object.freeze([...value])])
  }

  return entries
}
