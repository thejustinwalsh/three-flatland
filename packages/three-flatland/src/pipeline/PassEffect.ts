import { trait, type NumericSchema, type NumericStore, type World } from '../ecs/runtime'
import { uniform } from 'three/tsl'
import { Vector2, Vector3, Vector4 } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type {
  EffectSchema,
  EffectSchemaValue,
  EffectField,
  EffectValues,
  EffectConstants,
  UniformKeys,
  SchemaToNodeType,
} from '../materials/MaterialEffect'
import { entitySlot } from '../ecs/snapshot'
import { validateEffectSchema } from '../internal/effectSchemaValidation'
import type { SpriteGroup } from './SpriteGroup'
import { getSpriteGroupWorld } from '../internal/sprite-group-runtime'
import {
  getEffectEntity,
  getEffectTrait,
  readEffectVectorSnapshot,
  setEffectEntity,
  setEffectTrait,
} from '../internal/effect-runtime'

// Re-export schema types for PassEffect consumers
export type { EffectSchema, EffectSchemaValue, EffectField, EffectValues, EffectConstants, UniformKeys }

function createSchemaRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/** Resolve the effect class without trusting a user-defined `constructor` schema field. @internal */
function passEffectClassOf(effect: PassEffect): typeof PassEffect {
  return (Object.getPrototypeOf(effect) as { constructor: typeof PassEffect }).constructor
}

// ============================================
// PassEffect Types
// ============================================

/** A post-processing pass function that transforms scene color. */
export type PassEffectFn = (input: Node<'vec4'>, uv: Node<'vec2'>) => Node<'vec4'>

/** Context passed to a PassEffect's static buildPass method. */
export interface PassEffectContext<S extends EffectSchema = EffectSchema> {
  /** TSL uniform nodes for each uniform schema field, keyed by field name. */
  uniforms: { [K in UniformKeys<S>]: SchemaToNodeType<S[K]> }
  /** Read-only constants from factory function fields. */
  constants: EffectConstants<S>
}

// Forward-declare Flatland to avoid circular import
interface FlatlandLike {
  readonly spriteGroup: SpriteGroup
  _markPostPassDirty(): void
}

// Uniform node storage type — union of all possible uniform node types
type UniformNodeValue =
  | UniformNode<'float', number>
  | UniformNode<'vec2', Vector2>
  | UniformNode<'vec3', Vector3>
  | UniformNode<'vec4', Vector4>

// ============================================
// PassEffect Base Class
// ============================================

/**
 * Base class for post-processing pass effects.
 *
 * Mirrors the MaterialEffect pattern: class-based, schema-driven, with property
 * accessors. Uses TSL `uniform()` nodes for zero-cost runtime parameter updates —
 * changing a parameter updates the uniform value directly without rebuilding the
 * node graph.
 *
 * @example Class-based definition:
 * ```typescript
 * class CRTEffect extends PassEffect {
 *   static readonly passName = 'crt'
 *   static readonly passSchema = { curvature: 0.1, scanlineIntensity: 0.2 } as const
 *   declare curvature: number
 *   declare scanlineIntensity: number
 *
 *   static buildPass({ uniforms }: PassEffectContext): PassEffectFn {
 *     return (input, uv) => crtComplete(input, uv, {
 *       curvature: uniforms.curvature,
 *       scanlineIntensity: uniforms.scanlineIntensity,
 *     })
 *   }
 * }
 * ```
 *
 * @example Factory definition:
 * ```typescript
 * const VignetteEffect = createPassEffect({
 *   name: 'vignette',
 *   schema: { intensity: 0.5 },
 *   pass: ({ uniforms }) => (input, uv) => vignette(input, uv, uniforms.intensity),
 * })
 * ```
 */
export abstract class PassEffect {
  // ============================================
  // Static fields (shared across all instances of a subclass)
  // ============================================

  /** Unique pass name. Must be overridden by subclass. */
  static readonly passName: string
  /** Per-pass data schema with default values. Must be overridden by subclass. */
  static readonly passSchema: EffectSchema

  /** @internal Computed field metadata from schema. */
  static _fields: EffectField[]
  /** @internal Precomputed flattened SoA keys for each field. */
  static _fieldKeys: Readonly<Record<string, readonly string[]>>
  /** @internal Constant-time field lookup for property accessors. */
  static _fieldMap: ReadonlyMap<string, EffectField>
  /** @internal Total float slots needed for this pass's data. */
  static _totalFloats: number
  /** @internal Whether static initialization has been performed. */
  static _initialized: boolean = false

  /**
   * Build the pass function. Must be overridden by subclass (class-based path).
   * Called once when the pass is added to Flatland. The returned function closes
   * over uniform nodes for zero-cost parameter updates.
   */
  static buildPass(_context: PassEffectContext): PassEffectFn {
    throw new Error(`PassEffect.buildPass() not implemented for ${this.passName}`)
  }

  /** @internal Factory functions for constant fields (keyed by field name). */
  static _constantFactories: Record<string, () => unknown>

  /**
   * Initialize static metadata from the schema (called once per subclass, lazily).
   * @internal
   */
  static _initialize(): void {
    if (Object.hasOwn(this, '_initialized') && this._initialized) return

    const schema = this.passSchema
    if (!schema) {
      throw new Error(`PassEffect: ${this.name} is missing passSchema`)
    }
    const schemaEntries = validateEffectSchema('PassEffect', this.passName, schema, this.prototype)

    // Compute field metadata from schema defaults (uniform fields only)
    const fields: EffectField[] = []
    const constantFactories = createSchemaRecord<() => unknown>()
    let totalFloats = 0
    for (const [fieldName, value] of schemaEntries) {
      if (typeof value === 'function') {
        constantFactories[fieldName] = value as () => unknown
      } else if (typeof value === 'number') {
        fields.push({ name: fieldName, size: 1, default: [value] })
        totalFloats += 1
      } else {
        const arr = value as readonly number[]
        fields.push({ name: fieldName, size: arr.length, default: [...arr] })
        totalFloats += arr.length
      }
    }

    this._fields = fields
    const fieldKeys = createSchemaRecord<readonly string[]>()
    for (const field of fields) {
      const keys: string[] = []
      for (let i = 0; i < field.size; i++) keys.push(field.size === 1 ? field.name : `${field.name}_${i}`)
      fieldKeys[field.name] = keys
    }
    this._fieldKeys = fieldKeys
    this._fieldMap = new Map(fields.map((field) => [field.name, field]))
    this._totalFloats = totalFloats
    this._constantFactories = constantFactories

    // Build the flattened numeric trait schema (uniform fields only):
    // - float fields → { fieldName: default }
    // - vecN fields  → { fieldName_0: v[0], fieldName_1: v[1], ... }
    const traitSchema = createSchemaRecord<number>()
    for (const field of fields) {
      if (field.size === 1) {
        traitSchema[field.name] = field.default[0]!
      } else {
        for (let i = 0; i < field.size; i++) {
          traitSchema[`${field.name}_${i}`] = field.default[i]!
        }
      }
    }

    setEffectTrait(this, trait(traitSchema))
    this._initialized = true
  }

  // ============================================
  // Instance fields
  // ============================================

  /** Pass name (from static). */
  readonly name: string

  /** @internal The Flatland instance this pass is attached to. */
  _flatland: FlatlandLike | null = null

  /** Cached numeric SoA for allocation-free enrolled property access. */
  private _numericStore: NumericStore<NumericSchema> | null = null

  /** World owning `_numericStore`; passes may move between Flatland instances. */
  private _storeWorld: World | null = null

  /** @internal Snapshot defaults for pre-enrollment staging. */
  _defaults: Record<string, number | number[]>

  /** @internal Per-instance constant values (from factory function schema fields). */
  _constants: Record<string, unknown> = createSchemaRecord<unknown>()

  /** @internal TSL uniform nodes — one per uniform schema field. */
  _uniforms: Record<string, UniformNodeValue>

  /** @internal Cached result of buildPass(). */
  _passFn: PassEffectFn | null = null

  /** @internal Sort order (set by addPass). */
  _order = 0

  /** @internal Whether this pass is enabled. */
  private _enabled = true

  constructor() {
    const ctor = passEffectClassOf(this)

    // Lazy initialize static metadata
    ctor._initialize()

    this.name = ctor.passName

    // Build defaults snapshot from schema (uniform fields only)
    this._defaults = createSchemaRecord<number | number[]>()
    for (const field of ctor._fields) {
      if (field.size === 1) {
        this._defaults[field.name] = field.default[0]!
      } else {
        this._defaults[field.name] = [...field.default]
      }
    }

    // Create uniform nodes per uniform schema field
    this._uniforms = createSchemaRecord<UniformNodeValue>()
    for (const field of ctor._fields) {
      const d = field.default
      if (field.size === 1) {
        this._uniforms[field.name] = uniform(d[0]!)
      } else if (field.size === 2) {
        this._uniforms[field.name] = uniform(new Vector2(d[0], d[1]))
      } else if (field.size === 3) {
        this._uniforms[field.name] = uniform(new Vector3(d[0], d[1], d[2]))
      } else {
        this._uniforms[field.name] = uniform(new Vector4(d[0], d[1], d[2], d[3]))
      }
    }

    // Set up property accessors for uniform schema fields
    for (const field of ctor._fields) {
      if (field.size === 1) {
        Object.defineProperty(this, field.name, {
          get: () => this._getField(field.name),
          set: (v: number) => this._setField(field.name, v),
          enumerable: true,
        })
      } else {
        Object.defineProperty(this, field.name, {
          get: () => this._getField(field.name),
          set: (v: readonly number[]) => this._setField(field.name, v),
          enumerable: true,
        })
      }
    }

    // Initialize constant fields — call factory, store value, define read-only property
    for (const [name, factory] of Object.entries(ctor._constantFactories)) {
      const value = factory()
      this._constants[name] = value
      Object.defineProperty(this, name, {
        get: () => this._constants[name],
        enumerable: true,
      })
    }
  }

  /** Whether this pass is enabled in the chain. */
  get enabled(): boolean {
    return this._enabled
  }

  /** Toggle enabled state. This is a structural change — rebuilds the chain. */
  set enabled(value: boolean) {
    if (this._enabled === value) return
    this._enabled = value
    if (this._flatland) {
      this._flatland._markPostPassDirty()
    }
  }

  /**
   * Attach this pass to a Flatland instance.
   * @internal Called by Flatland.addPass()
   */
  _attach(flatland: FlatlandLike): void {
    this._flatland = flatland
    this._cacheStore(getSpriteGroupWorld(flatland.spriteGroup))
  }

  /**
   * Detach this pass from its Flatland instance.
   * @internal Called by Flatland.removePass()
   */
  _detach(): void {
    this._flatland = null
    setEffectEntity(this, null)
    this._numericStore = null
    this._storeWorld = null
    this._passFn = null
  }

  private _cacheStore(world: World): NumericStore<NumericSchema> {
    if (this._storeWorld !== world || !this._numericStore) {
      const ctor = passEffectClassOf(this)
      this._numericStore = world.store(getEffectTrait(ctor))
      this._storeWorld = world
    }
    return this._numericStore
  }

  /**
   * Build and cache the pass function by calling the static buildPass() once.
   * The returned function closes over uniform nodes and constants.
   * @internal
   */
  _buildPassFn(): PassEffectFn {
    if (!this._passFn) {
      const ctor = passEffectClassOf(this)
      this._passFn = ctor.buildPass({ uniforms: this._uniforms, constants: this._constants })
    }
    return this._passFn
  }

  /**
   * Read a field value.
   * If attached with an entity, reads from ECS trait. Otherwise reads from defaults.
   * @internal
   */
  _getField(name: string): number | readonly number[] {
    const ctor = passEffectClassOf(this)
    const world = this._storeWorld
    const entity = getEffectEntity(this)
    const runtimeTrait = getEffectTrait(ctor)
    if (entity && world?.has(entity, runtimeTrait)) {
      const field = ctor._fieldMap.get(name)!
      const keys = ctor._fieldKeys[name]!
      const store = this._cacheStore(world)
      const index = entitySlot(entity)
      if (field.size === 1) {
        return store[keys[0]!]![index]!
      } else {
        return readEffectVectorSnapshot(
          this,
          name,
          field.size,
          store[keys[0]!]![index]!,
          store[keys[1]!]![index]!,
          field.size >= 3 ? store[keys[2]!]![index]! : 0,
          field.size >= 4 ? store[keys[3]!]![index]! : 0
        )
      }
    }
    const staged = this._defaults[name]!
    if (typeof staged === 'number') return staged
    const field = ctor._fieldMap.get(name)!
    return readEffectVectorSnapshot(
      this,
      name,
      field.size,
      staged[0]!,
      staged[1]!,
      field.size >= 3 ? staged[2]! : 0,
      field.size >= 4 ? staged[3]! : 0
    )
  }

  /**
   * Write a field value.
   * 1. Writes to ECS trait (if enrolled)
   * 2. Updates uniform.value directly (zero-cost, no rebuild)
   * 3. Also updates snapshot defaults
   * @internal
   */
  _setField(name: string, value: number | readonly number[]): void {
    const ctor = passEffectClassOf(this)
    const field = ctor._fieldMap.get(name)!
    let scalar = 0
    let c0 = 0
    let c1 = 0
    let c2 = 0
    let c3 = 0
    if (field.size === 1) {
      if (typeof value !== 'number') throw new TypeError(`PassEffect.${field.name} must be a number`)
      scalar = value
    } else {
      if (!Array.isArray(value) || value.length !== field.size) {
        throw new TypeError(`PassEffect.${field.name} must provide ${field.size} numeric components`)
      }
      c0 = value[0]!
      c1 = value[1]!
      if (field.size >= 3) c2 = value[2]!
      if (field.size >= 4) c3 = value[3]!
      if (
        typeof c0 !== 'number' ||
        typeof c1 !== 'number' ||
        (field.size >= 3 && typeof c2 !== 'number') ||
        (field.size >= 4 && typeof c3 !== 'number')
      ) {
        throw new TypeError(`PassEffect.${field.name} must provide ${field.size} numeric components`)
      }
    }

    // Update snapshot defaults
    if (field.size === 1) {
      this._defaults[name] = scalar
    } else {
      const defaults = this._defaults[name] as number[]
      defaults[0] = c0
      defaults[1] = c1
      if (field.size >= 3) defaults[2] = c2
      if (field.size >= 4) defaults[3] = c3
    }

    // Write to ECS trait if enrolled
    const world = this._storeWorld
    const entity = getEffectEntity(this)
    const runtimeTrait = getEffectTrait(ctor)
    if (entity && world?.has(entity, runtimeTrait)) {
      const keys = ctor._fieldKeys[name]!
      const store = this._cacheStore(world)
      const index = entitySlot(entity)
      if (field.size === 1) {
        store[keys[0]!]![index] = scalar
      } else {
        for (let i = 0; i < field.size; i++) {
          store[keys[i]!]![index] = i === 0 ? c0 : i === 1 ? c1 : i === 2 ? c2 : c3
        }
      }
    }

    // Update uniform value directly — zero-cost, no node graph rebuild
    const uniformNode = this._uniforms[name]
    if (uniformNode) {
      if (field.size === 1) {
        ;(uniformNode as UniformNode<'float', number>).value = scalar
      } else {
        const vecUniform = uniformNode as
          | UniformNode<'vec2', Vector2>
          | UniformNode<'vec3', Vector3>
          | UniformNode<'vec4', Vector4>
        const obj = vecUniform.value
        obj.x = c0
        ;(obj as Vector2).y = c1
        if (field.size >= 3) (obj as Vector3).z = c2
        if (field.size >= 4) (obj as Vector4).w = c3
      }
    }
  }
}

// ============================================
// Factory: createPassEffect
// ============================================

/** Configuration passed to createPassEffect(). */
interface PassEffectConfig<S extends EffectSchema> {
  /** Unique name for this pass effect. */
  name: string
  /** Per-pass data schema — default values define types and initial values. */
  schema: S
  /** Pass builder: receives uniform nodes, returns a PassEffectFn. */
  pass: (context: PassEffectContext<S>) => PassEffectFn
}

/**
 * Type for a PassEffect class created by the factory.
 * Instances have typed properties matching the schema.
 */
export type PassEffectClass<S extends EffectSchema> = {
  new (): PassEffect & EffectValues<S> & EffectConstants<S>
  readonly passName: string
  readonly passSchema: S
  readonly _fields: EffectField[]
  readonly _fieldKeys: Readonly<Record<string, readonly string[]>>
  readonly _fieldMap: ReadonlyMap<string, EffectField>
  readonly _totalFloats: number
  readonly _constantFactories: Record<string, () => unknown>
  readonly _initialized: boolean
  _initialize(): void
  buildPass(context: PassEffectContext<S>): PassEffectFn
}

/**
 * Create a PassEffect class from a configuration object.
 *
 * @example
 * ```typescript
 * const VignetteEffect = createPassEffect({
 *   name: 'vignette',
 *   schema: { intensity: 0.5 },
 *   pass: ({ uniforms }) => (input, uv) => vignette(input, uv, uniforms.intensity),
 * })
 *
 * const v = new VignetteEffect()
 * flatland.addPass(v)
 * v.intensity = 0.8  // zero-cost uniform update
 * ```
 */
export function createPassEffect<const S extends EffectSchema>(config: PassEffectConfig<S>): PassEffectClass<S> {
  const { name, schema, pass: passFn } = config

  const EffectClass = class extends PassEffect {
    static readonly passName = name
    static readonly passSchema = schema as EffectSchema
    static override _initialized: boolean = false

    static override buildPass(context: PassEffectContext): PassEffectFn {
      return passFn(context as PassEffectContext<S>)
    }
  }

  Object.defineProperty(EffectClass, 'name', { value: `${name}Effect` })

  return EffectClass as unknown as PassEffectClass<S>
}
