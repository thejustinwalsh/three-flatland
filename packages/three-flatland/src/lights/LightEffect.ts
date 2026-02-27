import { trait, type Entity, type Trait } from 'koota'
import { uniform } from 'three/tsl'
import { Vector2, Vector3, Vector4 } from 'three'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type {
  EffectSchema,
  EffectSchemaValue,
  EffectField,
  EffectValues,
  SchemaToNodeType,
} from '../materials/MaterialEffect'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { LightingSystem } from './LightingSystem'

// Re-export schema types for LightEffect consumers
export type { EffectSchema, EffectSchemaValue, EffectField, EffectValues }

// ============================================
// LightEffect Types
// ============================================

/** Context passed to a LightEffect's static buildLightFn method. */
export interface LightEffectContext<S extends EffectSchema = EffectSchema> {
  /** TSL uniform nodes for each schema field, keyed by field name. */
  uniforms: { [K in keyof S]: SchemaToNodeType<S[K]> }
  /** The LightingSystem providing light data textures and the light loop. */
  lightingSystem: LightingSystem
}

// Forward-declare Flatland to avoid circular import
interface FlatlandLike {
  _markLightingDirty(): void
}

// Uniform node storage type — union of all possible uniform node types
type UniformNodeValue =
  | UniformNode<'float', number>
  | UniformNode<'vec2', Vector2>
  | UniformNode<'vec3', Vector3>
  | UniformNode<'vec4', Vector4>

// ============================================
// LightEffect Base Class
// ============================================

/**
 * Base class for lighting effects applied to Flatland sprites.
 *
 * Mirrors the PassEffect pattern: class-based, schema-driven, with property
 * accessors. Uses TSL `uniform()` nodes for zero-cost runtime parameter updates.
 *
 * LightEffect produces a `ColorTransformFn` that is automatically assigned to
 * all lit sprites. The transform runs in the material shader, reading light data
 * from shared DataTextures managed by LightingSystem.
 *
 * @example Class-based definition:
 * ```typescript
 * class SimpleLightEffect extends LightEffect {
 *   static readonly lightName = 'simpleLight'
 *   static readonly lightSchema = { ambientIntensity: 0.2 } as const
 *   declare ambientIntensity: number
 *
 *   static buildLightFn({ uniforms, lightingSystem }: LightEffectContext): ColorTransformFn {
 *     return lightingSystem.createColorTransform({ shadows: false })
 *   }
 * }
 * ```
 */
export abstract class LightEffect {
  // ============================================
  // Static fields (shared across all instances of a subclass)
  // ============================================

  /** Unique light effect name. Must be overridden by subclass. */
  static readonly lightName: string
  /** Per-effect data schema with default values. Must be overridden by subclass. */
  static readonly lightSchema: EffectSchema

  /** @internal Auto-generated Koota trait from schema. */
  static _trait: Trait
  /** @internal Computed field metadata from schema. */
  static _fields: EffectField[]
  /** @internal Total float slots needed for this effect's data. */
  static _totalFloats: number
  /** @internal Whether static initialization has been performed. */
  static _initialized: boolean = false

  /**
   * Build the lighting ColorTransformFn. Must be overridden by subclass.
   * Called once when the effect is attached to Flatland. The returned function
   * closes over uniform nodes for zero-cost parameter updates.
   */
  static buildLightFn(_context: LightEffectContext): ColorTransformFn {
    throw new Error(`LightEffect.buildLightFn() not implemented for ${this.lightName}`)
  }

  /**
   * Initialize static metadata from the schema (called once per subclass, lazily).
   * @internal
   */
  static _initialize(): void {
    if (this._initialized) return
    this._initialized = true

    const schema = this.lightSchema
    if (!schema) {
      throw new Error(`LightEffect: ${this.name} is missing lightSchema`)
    }

    // Compute field metadata from schema defaults
    const fields: EffectField[] = []
    let totalFloats = 0
    for (const [fieldName, value] of Object.entries(schema)) {
      if (typeof value === 'number') {
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

    // Build flattened trait schema for Koota
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

  /** Effect name (from static). */
  readonly name: string

  /** @internal The Flatland instance this effect is attached to. */
  _flatland: FlatlandLike | null = null

  /** @internal The ECS entity for this effect. */
  _entity: Entity | null = null

  /** @internal Snapshot defaults for pre-enrollment staging. */
  _defaults: Record<string, number | number[]>

  /** @internal TSL uniform nodes — one per schema field. */
  _uniforms: Record<string, UniformNodeValue>

  /** @internal Cached result of buildLightFn(). */
  _lightFn: ColorTransformFn | null = null

  /** @internal Whether this effect is enabled. */
  private _enabled = true

  constructor() {
    const ctor = this.constructor as typeof LightEffect

    // Lazy initialize static metadata
    ctor._initialize()

    this.name = ctor.lightName

    // Build defaults snapshot from schema
    this._defaults = {}
    for (const field of ctor._fields) {
      if (field.size === 1) {
        this._defaults[field.name] = field.default[0]!
      } else {
        this._defaults[field.name] = [...field.default]
      }
    }

    // Create uniform nodes per schema field
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

    // Set up property accessors for each schema field
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
  }

  /** Whether this effect is enabled. */
  get enabled(): boolean {
    return this._enabled
  }

  /** Toggle enabled state. Structural change — marks lighting dirty. */
  set enabled(value: boolean) {
    if (this._enabled === value) return
    this._enabled = value
    if (this._flatland) {
      this._flatland._markLightingDirty()
    }
  }

  /**
   * Attach this effect to a Flatland instance.
   * @internal Called by Flatland.setLighting()
   */
  _attach(flatland: FlatlandLike): void {
    this._flatland = flatland
  }

  /**
   * Detach this effect from its Flatland instance.
   * @internal Called by Flatland when lighting is replaced
   */
  _detach(): void {
    this._flatland = null
    this._entity = null
    this._lightFn = null
  }

  /**
   * Build and cache the light function by calling the static buildLightFn() once.
   * The returned function closes over uniform nodes.
   * @internal
   */
  _buildLightFn(lightingSystem: LightingSystem): ColorTransformFn {
    if (!this._lightFn) {
      const ctor = this.constructor as typeof LightEffect
      this._lightFn = ctor.buildLightFn({ uniforms: this._uniforms, lightingSystem })
    }
    return this._lightFn
  }

  /**
   * Read a field value.
   * @internal
   */
  _getField(name: string): number | number[] {
    const ctor = this.constructor as typeof LightEffect
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
   * Updates ECS trait, uniform value, and snapshot defaults.
   * @internal
   */
  _setField(name: string, value: number | number[]): void {
    const ctor = this.constructor as typeof LightEffect
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
// Factory: createLightEffect
// ============================================

/** Configuration passed to createLightEffect(). */
interface LightEffectConfig<S extends EffectSchema> {
  /** Unique name for this light effect. */
  name: string
  /** Per-effect data schema — default values define types and initial values. */
  schema: S
  /** Light builder: receives uniform nodes + lighting system, returns a ColorTransformFn. */
  light: (context: LightEffectContext<S>) => ColorTransformFn
}

/**
 * Type for a LightEffect class created by the factory.
 * Instances have typed properties matching the schema.
 */
export type LightEffectClass<S extends EffectSchema> = {
  new (): LightEffect & EffectValues<S>
  readonly lightName: string
  readonly lightSchema: S
  readonly _trait: Trait
  readonly _fields: EffectField[]
  readonly _totalFloats: number
  readonly _initialized: boolean
  _initialize(): void
  buildLightFn(context: LightEffectContext<S>): ColorTransformFn
}

/**
 * Create a LightEffect class from a configuration object.
 *
 * @example
 * ```typescript
 * const SimpleLightEffect = createLightEffect({
 *   name: 'simpleLight',
 *   schema: { ambientIntensity: 0.2 },
 *   light: ({ uniforms, lightingSystem }) =>
 *     lightingSystem.createColorTransform({ shadows: false }),
 * })
 *
 * const lighting = new SimpleLightEffect()
 * flatland.setLighting(lighting)
 * lighting.ambientIntensity = 0.4  // zero-cost uniform update
 * ```
 */
export function createLightEffect<const S extends EffectSchema>(
  config: LightEffectConfig<S>
): LightEffectClass<S> {
  const { name, schema, light: lightFn } = config

  const EffectClass = class extends LightEffect {
    static readonly lightName = name
    static readonly lightSchema = schema as EffectSchema
    static override _initialized: boolean = false

    static override buildLightFn(context: LightEffectContext): ColorTransformFn {
      return lightFn(context as LightEffectContext<S>)
    }
  }

  Object.defineProperty(EffectClass, 'name', { value: `${name}Effect` })

  return EffectClass as unknown as LightEffectClass<S>
}
