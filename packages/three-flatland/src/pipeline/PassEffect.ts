import { trait, type Entity, type Trait } from 'koota'
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

// Re-export schema types for PassEffect consumers
export type { EffectSchema, EffectSchemaValue, EffectField, EffectValues, EffectConstants, UniformKeys }

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

  /** @internal Auto-generated Koota trait from schema. */
  static _trait: Trait
  /** @internal Computed field metadata from schema. */
  static _fields: EffectField[]
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
    if (this._initialized) return
    this._initialized = true

    const schema = this.passSchema
    if (!schema) {
      throw new Error(`PassEffect: ${this.name} is missing passSchema`)
    }

    // Compute field metadata from schema defaults (uniform fields only)
    const fields: EffectField[] = []
    const constantFactories: Record<string, () => unknown> = {}
    let totalFloats = 0
    for (const [fieldName, value] of Object.entries(schema)) {
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
    this._totalFloats = totalFloats
    this._constantFactories = constantFactories

    // Build flattened trait schema for Koota (uniform fields only):
    // - float fields → { fieldName: default }
    // - vecN fields  → { fieldName_0: v[0], fieldName_1: v[1], ... }
    const traitSchema: Record<string, number> = {}
    for (const field of fields) {
      if (field.size === 1) {
        traitSchema[field.name] = field.default[0]!
      } else {
        for (let i = 0; i < field.size; i++) {
          traitSchema[`${field.name}_${i}`] = field.default[i]!
        }
      }
    }

    this._trait = trait(traitSchema)
  }

  // ============================================
  // Instance fields
  // ============================================

  /** Pass name (from static). */
  readonly name: string

  /** @internal The Flatland instance this pass is attached to. */
  _flatland: FlatlandLike | null = null

  /** @internal The ECS entity for this pass. */
  _entity: Entity | null = null

  /** @internal Snapshot defaults for pre-enrollment staging. */
  _defaults: Record<string, number | number[]>

  /** @internal Per-instance constant values (from factory function schema fields). */
  _constants: Record<string, unknown> = {}

  /** @internal TSL uniform nodes — one per uniform schema field. */
  _uniforms: Record<string, UniformNodeValue>

  /** @internal Cached result of buildPass(). */
  _passFn: PassEffectFn | null = null

  /** @internal Sort order (set by addPass). */
  _order = 0

  /** @internal Whether this pass is enabled. */
  private _enabled = true

  constructor() {
    const ctor = this.constructor as typeof PassEffect

    // Lazy initialize static metadata
    ctor._initialize()

    this.name = ctor.passName

    // Build defaults snapshot from schema (uniform fields only)
    this._defaults = {}
    for (const field of ctor._fields) {
      if (field.size === 1) {
        this._defaults[field.name] = field.default[0]!
      } else {
        this._defaults[field.name] = [...field.default]
      }
    }

    // Create uniform nodes per uniform schema field
    this._uniforms = {}
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
          configurable: true,
        })
      } else {
        Object.defineProperty(this, field.name, {
          get: () => this._getField(field.name),
          set: (v: number[]) => this._setField(field.name, v),
          enumerable: true,
          configurable: true,
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
        configurable: true,
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
  }

  /**
   * Detach this pass from its Flatland instance.
   * @internal Called by Flatland.removePass()
   */
  _detach(): void {
    this._flatland = null
    this._entity = null
    this._passFn = null
  }

  /**
   * Build and cache the pass function by calling the static buildPass() once.
   * The returned function closes over uniform nodes and constants.
   * @internal
   */
  _buildPassFn(): PassEffectFn {
    if (!this._passFn) {
      const ctor = this.constructor as typeof PassEffect
      this._passFn = ctor.buildPass({ uniforms: this._uniforms, constants: this._constants })
    }
    return this._passFn
  }

  /**
   * Read a field value.
   * If attached with an entity, reads from ECS trait. Otherwise reads from defaults.
   * @internal
   */
  _getField(name: string): number | number[] {
    const ctor = this.constructor as typeof PassEffect
    if (this._entity && this._entity.has(ctor._trait)) {
      const field = ctor._fields.find((f) => f.name === name)!
      const data = this._entity.get(ctor._trait) as Record<string, number>
      if (field.size === 1) {
        return data[name]!
      } else {
        const result: number[] = []
        for (let i = 0; i < field.size; i++) {
          result.push(data[`${name}_${i}`]!)
        }
        return result
      }
    }
    return this._defaults[name]!
  }

  /**
   * Write a field value.
   * 1. Writes to ECS trait (if enrolled)
   * 2. Updates uniform.value directly (zero-cost, no rebuild)
   * 3. Also updates snapshot defaults
   * @internal
   */
  _setField(name: string, value: number | number[]): void {
    const ctor = this.constructor as typeof PassEffect
    const field = ctor._fields.find((f) => f.name === name)!

    // Update snapshot defaults
    if (typeof value === 'number') {
      this._defaults[name] = value
    } else {
      this._defaults[name] = [...value]
    }

    // Write to ECS trait if enrolled
    if (this._entity && this._entity.has(ctor._trait)) {
      if (field.size === 1) {
        this._entity.set(ctor._trait, { [name]: value as number })
      } else {
        const arr = value as number[]
        const traitUpdate: Record<string, number> = {}
        for (let i = 0; i < field.size; i++) {
          traitUpdate[`${name}_${i}`] = arr[i]!
        }
        this._entity.set(ctor._trait, traitUpdate)
      }
    }

    // Update uniform value directly — zero-cost, no node graph rebuild
    const uniformNode = this._uniforms[name]
    if (uniformNode) {
      if (field.size === 1) {
        ;(uniformNode as UniformNode<'float', number>).value = value as number
      } else {
        const arr = value as number[]
        const vecUniform = uniformNode as
          | UniformNode<'vec2', Vector2>
          | UniformNode<'vec3', Vector3>
          | UniformNode<'vec4', Vector4>
        const obj = vecUniform.value
        obj.x = arr[0]!
        if (field.size >= 2) (obj as Vector2).y = arr[1]!
        if (field.size >= 3) (obj as Vector3).z = arr[2]!
        if (field.size >= 4) (obj as Vector4).w = arr[3]!
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
  readonly _trait: Trait
  readonly _fields: EffectField[]
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
export function createPassEffect<const S extends EffectSchema>(
  config: PassEffectConfig<S>
): PassEffectClass<S> {
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
