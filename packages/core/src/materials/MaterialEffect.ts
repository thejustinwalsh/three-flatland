import { trait } from 'koota'
import type { Entity, Trait } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { TSLNode } from '../nodes/types'

// ============================================
// Schema Types
// ============================================

/** A single field value in an effect schema (type inferred from shape). */
export type EffectSchemaValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]

/** An effect schema — maps field names to their default values. */
export type EffectSchema = Record<string, EffectSchemaValue>

/** Derive JS value types from an effect schema (used by property setters). */
export type EffectValues<S extends EffectSchema> = {
  -readonly [K in keyof S]: S[K] extends number
    ? number
    : S[K] extends readonly [number, number, number, number]
      ? [number, number, number, number]
      : S[K] extends readonly [number, number, number]
        ? [number, number, number]
        : S[K] extends readonly [number, number]
          ? [number, number]
          : never
}

// ============================================
// Field Metadata
// ============================================

/** Computed field metadata from schema. */
export interface EffectField {
  /** Field name (unprefixed). */
  name: string
  /** Number of float components (1=float, 2=vec2, 3=vec3, 4=vec4). */
  size: number
  /** Default values as flat array. */
  default: number[]
}

// ============================================
// Node Context
// ============================================

/** Context passed to an effect's TSL node builder. */
export interface EffectNodeContext<S extends EffectSchema = EffectSchema> {
  /** The previous color in the effect chain (vec4 TSL node). */
  inputColor: TSLNode
  /** Atlas UV coordinates (vec2 TSL node). */
  inputUV: TSLNode
  /** TSL attribute nodes for each schema field, keyed by unprefixed name. */
  attrs: { [K in keyof S]: TSLNode }
}

// ============================================
// MaterialEffect Base Class
// ============================================

/**
 * Base class for per-sprite shader effects.
 *
 * Each MaterialEffect subclass defines:
 * - `effectName` — unique name for the effect
 * - `effectSchema` — per-sprite data schema with default values
 * - `buildNode()` — TSL node builder for the effect shader
 *
 * Each MaterialEffect instance:
 * - Has typed property accessors for each schema field
 * - Uses the snapshot pattern for pre-enrollment staging
 * - Dual-writes to ECS traits and packed GPU buffers
 *
 * @example Class-based definition:
 * ```typescript
 * class DissolveEffect extends MaterialEffect {
 *   static readonly effectName = 'dissolve'
 *   static readonly effectSchema = { progress: 0 } as const
 *   declare progress: number
 *
 *   static buildNode({ inputColor, attrs }: EffectNodeContext) {
 *     return mix(inputColor, vec4(0, 0, 0, 0), attrs.progress)
 *   }
 * }
 * ```
 *
 * @example Factory definition:
 * ```typescript
 * const DissolveEffect = createMaterialEffect({
 *   name: 'dissolve',
 *   schema: { progress: 0 },
 *   node({ inputColor, attrs }) {
 *     return mix(inputColor, vec4(0, 0, 0, 0), attrs.progress)
 *   },
 * })
 * ```
 */
export abstract class MaterialEffect {
  // ============================================
  // Static fields (shared across all instances of a subclass)
  // ============================================

  /** Unique effect name. Must be overridden by subclass. */
  static readonly effectName: string
  /** Per-sprite data schema with default values. Must be overridden by subclass. */
  static readonly effectSchema: EffectSchema

  /** @internal Auto-generated Koota trait from schema. */
  static _trait: Trait
  /** @internal Computed field metadata from schema. */
  static _fields: EffectField[]
  /** @internal Total float slots needed for this effect's data (excluding flags). */
  static _totalFloats: number
  /** @internal TSL node builder function. */
  static _node: (context: EffectNodeContext) => TSLNode
  /** @internal Whether static initialization has been performed. */
  static _initialized: boolean = false

  /**
   * TSL node builder. Must be overridden by subclass (class-based path).
   * The factory path sets this via static assignment.
   */
  static buildNode(_context: EffectNodeContext): TSLNode {
    throw new Error(`MaterialEffect.buildNode() not implemented for ${this.effectName}`)
  }

  /**
   * Initialize static metadata from the schema (called once per subclass, lazily).
   * Computes field metadata, creates Koota trait, and sets up the node function.
   * @internal
   */
  static _initialize(): void {
    if (this._initialized) return
    this._initialized = true

    const schema = this.effectSchema
    if (!schema) {
      throw new Error(`MaterialEffect: ${this.name} is missing effectSchema`)
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

    // Build flattened trait schema for Koota:
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

    // Use buildNode as the node function
    this._node = this.buildNode.bind(this) as (context: EffectNodeContext) => TSLNode
  }

  // ============================================
  // Instance fields
  // ============================================

  /** Effect name (from static). */
  readonly name: string

  /** @internal The sprite this effect is attached to. */
  _sprite: Sprite2D | null = null

  /** @internal The ECS entity for the parent sprite. */
  _entity: Entity | null = null

  /** @internal Snapshot defaults for pre-enrollment staging. Keyed by field name. */
  _defaults: Record<string, number | number[]>

  constructor() {
    const ctor = this.constructor as typeof MaterialEffect

    // Lazy initialize static metadata
    ctor._initialize()

    this.name = ctor.effectName

    // Build defaults snapshot from schema
    this._defaults = {}
    for (const field of ctor._fields) {
      if (field.size === 1) {
        this._defaults[field.name] = field.default[0]!
      } else {
        this._defaults[field.name] = [...field.default]
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

  /**
   * Attach this effect to a sprite.
   * @internal Called by Sprite2D.addEffect()
   */
  _attach(sprite: Sprite2D): void {
    this._sprite = sprite
    this._entity = sprite._entity
  }

  /**
   * Detach this effect from its sprite.
   * @internal Called by Sprite2D.removeEffect()
   */
  _detach(): void {
    this._sprite = null
    this._entity = null
  }

  /**
   * Read a field value using the snapshot pattern.
   * If attached to an enrolled sprite, reads from ECS trait.
   * Otherwise, reads from the snapshot defaults.
   * @internal
   */
  _getField(name: string): number | number[] {
    const ctor = this.constructor as typeof MaterialEffect
    if (this._entity && this._entity.has(ctor._trait)) {
      // Read from trait
      const field = ctor._fields.find(f => f.name === name)!
      if (field.size === 1) {
        return this._entity.get(ctor._trait)[name] as number
      } else {
        const data = this._entity.get(ctor._trait)
        const result: number[] = []
        for (let i = 0; i < field.size; i++) {
          result.push(data[`${name}_${i}`] as number)
        }
        return result
      }
    }
    return this._defaults[name]!
  }

  /**
   * Write a field value using the snapshot pattern.
   * If attached to an enrolled sprite, writes to ECS trait (systems sync to GPU).
   * Otherwise, writes to the snapshot defaults.
   * Only triggers immediate GPU buffer sync for standalone sprites.
   * @internal
   */
  _setField(name: string, value: number | number[]): void {
    const ctor = this.constructor as typeof MaterialEffect

    if (this._entity && this._entity.has(ctor._trait)) {
      // Write to trait — systems will sync to batch buffers
      const field = ctor._fields.find(f => f.name === name)!
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
    } else {
      // Write to snapshot defaults
      if (typeof value === 'number') {
        this._defaults[name] = value
      } else {
        this._defaults[name] = [...value]
      }
    }

    // Standalone only: immediate own-buffer write
    if (this._sprite && !this._sprite._entity) {
      this._sprite._writeEffectDataOwn()
    }
  }
}

// ============================================
// Factory: createMaterialEffect
// ============================================

/** Configuration passed to createMaterialEffect(). */
interface MaterialEffectConfig<S extends EffectSchema> {
  /** Unique name for this effect. */
  name: string
  /** Per-sprite data schema — default values define types and initial values. */
  schema: S
  /** TSL node builder: receives input color, UV, and per-field attribute nodes. */
  node: (context: EffectNodeContext<S>) => TSLNode
}

/**
 * Type for a MaterialEffect class created by the factory.
 * Instances have typed properties matching the schema.
 */
export type MaterialEffectClass<S extends EffectSchema> = {
  new (): MaterialEffect & EffectValues<S>
  readonly effectName: string
  readonly effectSchema: S
  readonly _trait: Trait
  readonly _fields: EffectField[]
  readonly _totalFloats: number
  readonly _node: (context: EffectNodeContext) => TSLNode
  readonly _initialized: boolean
  _initialize(): void
  buildNode(context: EffectNodeContext<S>): TSLNode
}

/**
 * Create a MaterialEffect class from a configuration object.
 *
 * This is the simple factory path — for quick effect definitions without
 * writing a full class. Returns a class that extends MaterialEffect with
 * typed properties.
 *
 * @example
 * ```typescript
 * const DissolveEffect = createMaterialEffect({
 *   name: 'dissolve',
 *   schema: { progress: 0 },
 *   node({ inputColor, attrs }) {
 *     return mix(inputColor, vec4(0, 0, 0, 0), attrs.progress)
 *   },
 * })
 *
 * const dissolve = new DissolveEffect()
 * dissolve.progress = 0.5
 * sprite.addEffect(dissolve)
 * ```
 */
export function createMaterialEffect<const S extends EffectSchema>(
  config: MaterialEffectConfig<S>
): MaterialEffectClass<S> {
  const { name, schema, node } = config

  // Create anonymous subclass with static fields
  const EffectClass = class extends MaterialEffect {
    static readonly effectName = name
    static readonly effectSchema = schema as EffectSchema
    static override _initialized: boolean = false

    static override buildNode(context: EffectNodeContext): TSLNode {
      return node(context as EffectNodeContext<S>)
    }
  }

  // Give the class a readable name for debugging
  Object.defineProperty(EffectClass, 'name', { value: `${name}Effect` })

  return EffectClass as unknown as MaterialEffectClass<S>
}
