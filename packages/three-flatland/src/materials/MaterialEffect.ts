import { trait, type NumericSchema, type NumericStore, type World } from '../ecs/runtime'
import type Node from 'three/src/nodes/core/Node.js'
import type { Texture } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { TileMap2D } from '../tilemap/TileMap2D'
import type { ChannelName, ChannelNodeMap } from './channels'
import { entitySlot } from '../ecs/snapshot'
import { validateEffectSchema } from '../internal/effectSchemaValidation'
import { syncTileMapEffectProjection } from '../internal/tile-map-effect-projection'
import {
  beginEffectVectorReadOverride,
  getEffectEntity,
  getEffectTrait,
  readEffectVectorSnapshot,
  restoreEffectVectorReadOverride,
  setEffectEntity,
  setEffectTrait,
} from '../internal/effect-runtime'
import { spriteEntity, spriteWorld } from '../internal/sprite-runtime'

// ============================================
// Schema Types
// ============================================

/** A single field value in an effect schema (type inferred from shape). */
export type EffectSchemaValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | (() => unknown)

/** An effect schema — maps field names to their default values. */
export type EffectSchema = Record<string, EffectSchemaValue>

/** Keys whose schema value is a plain number or tuple (→ TSL uniform, settable at runtime). */
export type UniformKeys<S extends EffectSchema> = {
  [K in keyof S]: S[K] extends (...args: never[]) => unknown ? never : K
}[keyof S]

/** Keys whose schema value is a factory function (→ typed constant, read-only reference). */
export type ConstantKeys<S extends EffectSchema> = {
  [K in keyof S]: S[K] extends (...args: never[]) => unknown ? K : never
}[keyof S]

/**
 * Derive JS value types from an effect schema (uniform fields only, used by
 * property setters). Vector getters return read-only tuple snapshots. Update a
 * vector by assigning the complete tuple (`effect.offset = [x, y]`); mutating
 * snapshot components in place does not update ECS, uniforms, or GPU buffers.
 */
export type EffectValues<S extends EffectSchema> = {
  -readonly [K in UniformKeys<S>]: S[K] extends number
    ? number
    : S[K] extends readonly [number, number, number, number]
      ? readonly [number, number, number, number]
      : S[K] extends readonly [number, number, number]
        ? readonly [number, number, number]
        : S[K] extends readonly [number, number]
          ? readonly [number, number]
          : never
}

/**
 * Read-only constants from factory function fields.
 * The reference is frozen at construction time and cannot be reassigned, but the
 * object's internals are freely mutable and mutations take effect immediately
 * (e.g. `this.forwardPlus.resize(w, h)` works live — no remove/re-add needed).
 */
export type EffectConstants<S extends EffectSchema> = {
  // Writable — backed by a getter/setter that reads/writes `_constants`.
  // Assignment is only meaningful before `sprite.addEffect(effect)` —
  // after attach, the effect's material routing is locked in by the
  // values in `_constants` at the time of attach.
  [K in ConstantKeys<S>]: S[K] extends () => infer R ? R : never
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

function createSchemaRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/** Resolve the effect class without trusting a user-defined `constructor` schema field. @internal */
function materialEffectClassOf(effect: MaterialEffect): typeof MaterialEffect {
  return (Object.getPrototypeOf(effect) as { constructor: typeof MaterialEffect }).constructor
}

// ============================================
// Node Context
// ============================================

/** Map a uniform schema value type to the corresponding parameterized Node type. */
export type SchemaToNodeType<V extends EffectSchemaValue> = V extends (...args: never[]) => unknown
  ? never
  : V extends number
    ? Node<'float'>
    : V extends readonly [number, number, number, number]
      ? Node<'vec4'>
      : V extends readonly [number, number, number]
        ? Node<'vec3'>
        : V extends readonly [number, number]
          ? Node<'vec2'>
          : Node<'float'> | Node<'vec2'> | Node<'vec3'> | Node<'vec4'>

/** Context passed to an effect's TSL node builder. */
export interface EffectNodeContext<S extends EffectSchema = EffectSchema> {
  /** The previous color in the effect chain (vec4 node). */
  inputColor: Node<'vec4'>
  /** Atlas UV coordinates (vec2 node). */
  inputUV: Node<'vec2'>
  /** TSL attribute nodes for each uniform schema field, keyed by unprefixed name. */
  attrs: { [K in UniformKeys<S>]: SchemaToNodeType<S[K]> }
  /** Read-only constants from factory function fields. */
  constants: EffectConstants<S>
}

/** Context passed to a provider effect's channel node builder. */
export interface ChannelNodeContext<S extends EffectSchema = EffectSchema> {
  /** Atlas UV coordinates (vec2 node). */
  atlasUV: Node<'vec2'>
  /** Read-only constants from factory function fields. */
  constants: EffectConstants<S>
  /** TSL attribute nodes for each uniform schema field, keyed by unprefixed name. */
  attrs: { [K in UniformKeys<S>]: SchemaToNodeType<S[K]> }
  /** Base sprite texture (for auto-normal generation, etc.). Null if unavailable. */
  baseTexture: Texture | null
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
  /** Per-fragment channels this effect provides (e.g., ['normal']). */
  static readonly provides: readonly ChannelName[] = []
  /** Channel node builder — produces TSL nodes for declared channels. */
  static channelNode: ((channelName: string, context: ChannelNodeContext) => Node) | null = null

  /** @internal Computed field metadata from schema. */
  static _fields: EffectField[]
  /** @internal Precomputed flattened SoA keys for each field. */
  static _fieldKeys: Readonly<Record<string, readonly string[]>>
  /** @internal Constant-time field lookup for property accessors. */
  static _fieldMap: ReadonlyMap<string, EffectField>
  /** @internal Total float slots needed for this effect's data (excluding flags). */
  static _totalFloats: number
  /** @internal TSL node builder function. */
  static _node: (context: EffectNodeContext) => Node<'vec4'>
  /** @internal Whether static initialization has been performed. */
  static _initialized: boolean = false

  /**
   * TSL node builder. Must be overridden by subclass (class-based path).
   * The factory path sets this via static assignment.
   */
  static buildNode(_context: EffectNodeContext): Node<'vec4'> {
    throw new Error(`MaterialEffect.buildNode() not implemented for ${this.effectName}`)
  }

  /** @internal Factory functions for constant fields (keyed by field name). */
  static _constantFactories: Record<string, () => unknown>

  /**
   * Initialize static metadata from the schema (called once per subclass, lazily).
   * Computes field metadata, creates the numeric trait, and sets up the node function.
   * @internal
   */
  static _initialize(): void {
    if (Object.hasOwn(this, '_initialized') && this._initialized) return

    const schema = this.effectSchema
    if (!schema) {
      throw new Error(`MaterialEffect: ${this.name} is missing effectSchema`)
    }
    const schemaEntries = validateEffectSchema('MaterialEffect', this.effectName, schema, this.prototype)

    // Compute field metadata from schema defaults (uniform fields only)
    const fields: EffectField[] = []
    const constantFactories = createSchemaRecord<() => unknown>()
    let totalFloats = 0
    for (const [fieldName, value] of schemaEntries) {
      if (typeof value === 'function') {
        // Constant field — factory function, not a uniform
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

    // Use buildNode as the node function
    this._node = this.buildNode.bind(this) as (context: EffectNodeContext) => Node<'vec4'>
    this._initialized = true
  }

  // ============================================
  // Instance fields
  // ============================================

  /** Auto-incrementing unique ID for debugging. */
  static _nextId: number = 0

  /** Unique instance ID (like Three.js object ids). */
  readonly id: number

  /** Effect name (from static). */
  readonly name: string

  /** @internal The sprite this effect is attached to. */
  _sprite: Sprite2D | null = null

  /** @internal The tilemap this effect configures when used as a layer provider. */
  _tileMap: TileMap2D | null = null

  /** Cached numeric SoA for allocation-free enrolled property access. */
  private _numericStore: NumericStore<NumericSchema> | null = null

  /** World owning `_numericStore`; effects may be detached and re-enrolled elsewhere. */
  private _storeWorld: World | null = null

  /** @internal Snapshot defaults for pre-enrollment staging. Keyed by field name. */
  _defaults: Record<string, number | number[]>

  /**
   * Per-instance constant values (from factory function schema fields).
   * References are frozen at construction time and cannot be reassigned.
   * Internal state is freely mutable and mutations apply immediately.
   * @internal
   */
  _constants: Record<string, unknown> = createSchemaRecord<unknown>()

  constructor() {
    const ctor = materialEffectClassOf(this)

    // Lazy initialize static metadata
    ctor._initialize()

    this.id = MaterialEffect._nextId++
    this.name = ctor.effectName

    // Build defaults snapshot from schema (uniform fields only)
    this._defaults = createSchemaRecord<number | number[]>()
    for (const field of ctor._fields) {
      if (field.size === 1) {
        this._defaults[field.name] = field.default[0]!
      } else {
        this._defaults[field.name] = [...field.default]
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

    // Initialize constant fields — call factory, store value, expose a
    // getter/setter that writes back into `_constants`. Assignment is
    // only meaningful BEFORE the effect is attached to a sprite/tilemap
    // (the effect's effectsKey / material routing is computed from
    // `_constants` at addEffect time). After attach, a set will update
    // the stored value but the effect's material binding is already
    // locked in — primarily useful for library code (and R3F default
    // prop-setting) that initializes a constant prior to calling
    // `sprite.addEffect(effect)`.
    for (const [name, factory] of Object.entries(ctor._constantFactories)) {
      const value = factory()
      this._constants[name] = value
      Object.defineProperty(this, name, {
        get: () => this._constants[name],
        set: (v: unknown) => {
          this._constants[name] = v
        },
        enumerable: true,
      })
    }
  }

  /**
   * Attach this effect to a sprite.
   * @internal Called by Sprite2D.addEffect()
   */
  _attach(sprite: Sprite2D): void {
    this._sprite = sprite
    setEffectEntity(this, spriteEntity(sprite))
    const world = spriteWorld(sprite)
    if (world) this._cacheStore(world)
  }

  /** @internal Attach as retained tilemap material configuration. */
  _attachTileMap(tileMap: TileMap2D): void {
    this._tileMap = tileMap
  }

  /**
   * Detach this effect from its sprite.
   * @internal Called by Sprite2D.removeEffect()
   */
  _detach(): void {
    this._sprite = null
    setEffectEntity(this, null)
    this._numericStore = null
    this._storeWorld = null
  }

  /** @internal Detach retained tilemap material configuration. */
  _detachTileMap(): void {
    this._tileMap = null
  }

  /** @internal Bind the stable SoA arrays after a pre-attached effect is enrolled. */
  _bindStore(): void {
    const world = spriteWorld(this._sprite!)
    if (world) this._cacheStore(world)
  }

  private _cacheStore(world: World): NumericStore<NumericSchema> {
    if (this._storeWorld !== world || !this._numericStore) {
      const ctor = materialEffectClassOf(this)
      this._numericStore = world.store(getEffectTrait(ctor))
      this._storeWorld = world
    }
    return this._numericStore
  }

  /**
   * Read a field value using the snapshot pattern.
   * If attached to an enrolled sprite, reads from ECS trait.
   * Otherwise, reads from the snapshot defaults.
   * @internal
   */
  _getField(name: string): number | readonly number[] {
    const ctor = materialEffectClassOf(this)
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
   * Write a field value through the cached numeric store.
   * An enrolled sprite updates ECS state and, when currently batched against
   * the same material schema, its exact packed GPU row. Its standalone own
   * buffer remains untouched until demotion. A standalone sprite instead
   * writes the staged defaults and its own geometry buffer immediately.
   * @internal
   */
  _setField(name: string, value: number | readonly number[]): void {
    const ctor = materialEffectClassOf(this)
    const field = ctor._fieldMap.get(name)!
    let scalar = 0
    let c0 = 0
    let c1 = 0
    let c2 = 0
    let c3 = 0
    const previous = this._defaults[name]!
    const previousScalar = typeof previous === 'number' ? previous : 0
    const previous0 = typeof previous === 'number' ? 0 : previous[0]!
    const previous1 = typeof previous === 'number' ? 0 : previous[1]!
    const previous2 = typeof previous === 'number' ? 0 : (previous[2] ?? 0)
    const previous3 = typeof previous === 'number' ? 0 : (previous[3] ?? 0)
    if (field.size === 1) {
      if (typeof value !== 'number') throw new TypeError(`MaterialEffect.${field.name} must be a number`)
      scalar = value
    } else {
      if (!Array.isArray(value) || value.length !== field.size) {
        throw new TypeError(`MaterialEffect.${field.name} must provide ${field.size} numeric components`)
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
        throw new TypeError(`MaterialEffect.${field.name} must provide ${field.size} numeric components`)
      }
    }

    const stagingUnchanged =
      field.size === 1
        ? Object.is(previousScalar, scalar)
        : Object.is(previous0, c0) &&
          Object.is(previous1, c1) &&
          (field.size < 3 || Object.is(previous2, c2)) &&
          (field.size < 4 || Object.is(previous3, c3))

    const world = this._sprite ? spriteWorld(this._sprite) : null
    const entity = getEffectEntity(this)
    const runtimeTrait = getEffectTrait(ctor)
    let keys: readonly string[] | null = null
    let store: NumericStore<NumericSchema> | null = null
    let index = -1
    if (entity && world?.has(entity, runtimeTrait)) {
      keys = ctor._fieldKeys[name]!
      store = this._cacheStore(world)
      index = entitySlot(entity)
    }

    const backingUnchanged = store
      ? field.size === 1
        ? Object.is(store[keys![0]!]![index], scalar)
        : Object.is(store[keys![0]!]![index], c0) &&
          Object.is(store[keys![1]!]![index], c1) &&
          (field.size < 3 || Object.is(store[keys![2]!]![index], c2)) &&
          (field.size < 4 || Object.is(store[keys![3]!]![index], c3))
      : stagingUnchanged
    if (stagingUnchanged && backingUnchanged) return

    // Keep the detach/re-attach snapshot current even while ECS owns the live
    // value. removeEffect() deletes the numeric trait; addEffect() rebuilds it
    // from this snapshot, so an enrolled-only write must not be lost there.
    if (field.size === 1) {
      this._defaults[name] = scalar
    } else {
      const defaults = previous as number[]
      defaults[0] = c0
      defaults[1] = c1
      if (field.size >= 3) defaults[2] = c2
      if (field.size >= 4) defaults[3] = c3
    }

    if (this._tileMap) {
      let readOverrideActive = false
      try {
        if (field.size > 1) {
          beginEffectVectorReadOverride(this, name, field.size, previous0, previous1, previous2, previous3)
          readOverrideActive = true
        }
        syncTileMapEffectProjection(this._tileMap, this, name)
      } catch (error) {
        if (field.size === 1) {
          this._defaults[name] = previousScalar
        } else {
          const defaults = previous as number[]
          defaults[0] = previous0
          defaults[1] = previous1
          if (field.size >= 3) defaults[2] = previous2
          if (field.size >= 4) defaults[3] = previous3
        }
        throw error
      } finally {
        if (readOverrideActive) restoreEffectVectorReadOverride(this)
      }
    }

    if (store && keys && !backingUnchanged) {
      if (field.size === 1) {
        store[keys[0]!]![index] = scalar
      } else {
        for (let i = 0; i < field.size; i++) {
          store[keys[i]!]![index] = i === 0 ? c0 : i === 1 ? c1 : i === 2 ? c2 : c3
        }
      }

      // Uniform effect fields do not participate in material/run routing, so
      // no Changed event is required. Push the exact updated components to the
      // current physical batch row immediately; sort/reassign keep the sprite's
      // cached row synchronized with BatchSlot.
      const sprite = this._sprite
      const mesh = sprite?._batchMesh
      if (sprite && mesh && mesh.spriteMaterial === sprite.material && sprite._batchSlot >= 0) {
        const slotInfo = mesh.spriteMaterial._effectSlots.get(`${ctor.effectName}_${name}`)
        if (slotInfo) {
          if (field.size === 1) {
            const offset = slotInfo.offset
            mesh.writeEffectSlot(sprite._batchSlot, Math.floor(offset / 4), offset % 4, scalar)
          } else {
            for (let i = 0; i < field.size; i++) {
              const offset = slotInfo.offset + i
              const component = i === 0 ? c0 : i === 1 ? c1 : i === 2 ? c2 : c3
              mesh.writeEffectSlot(sprite._batchSlot, Math.floor(offset / 4), offset % 4, component)
            }
          }
        }
      }
    }

    // Standalone only: immediate own-buffer write
    if (this._sprite && !spriteEntity(this._sprite)) {
      this._sprite._writeEffectDataOwn()
    }
  }
}

// ============================================
// Factory: createMaterialEffect
// ============================================

/** Configuration passed to createMaterialEffect(). */
interface MaterialEffectConfig<S extends EffectSchema, C extends readonly ChannelName[] = readonly []> {
  /** Unique name for this effect. */
  name: string
  /** Per-sprite data schema — default values define types and initial values. */
  schema: S
  /** TSL node builder: receives input color, UV, and per-field attribute nodes. Optional for provider-only effects. */
  node?: (context: EffectNodeContext<S>) => Node<'vec4'>
  /**
   * Per-fragment channels this effect provides (e.g., `['normal'] as const`).
   * The `as const` (or literal array) is required for return-type narrowing
   * of {@link channelNode}.
   */
  provides?: C
  /**
   * Channel node builder — produces TSL nodes for declared channels.
   *
   * The return type is narrowed by the declared `provides`: if
   * `provides: ['normal'] as const`, the channelNode must return
   * `ChannelNodeMap['normal']` (i.e. `Node<'vec3'>`). For multi-channel
   * providers, the return is the union of `ChannelNodeMap[C[number]]` and
   * the function must narrow on `channelName` before returning.
   *
   * Omitting `provides` leaves `C = readonly []`, which makes this field
   * uncallable by type — a `channelNode` without a `provides` is a
   * compile-time error.
   */
  channelNode?: C extends readonly []
    ? never
    : (channelName: C[number], context: ChannelNodeContext<S>) => ChannelNodeMap[C[number]]
}

/**
 * Type for a MaterialEffect class created by the factory.
 * Instances have typed properties matching the schema.
 */
export type MaterialEffectClass<S extends EffectSchema> = {
  new (): MaterialEffect & EffectValues<S> & EffectConstants<S>
  readonly effectName: string
  readonly effectSchema: S
  readonly provides: readonly ChannelName[]
  readonly channelNode: ((channelName: string, context: ChannelNodeContext) => Node) | null
  readonly _fields: EffectField[]
  readonly _fieldKeys: Readonly<Record<string, readonly string[]>>
  readonly _fieldMap: ReadonlyMap<string, EffectField>
  readonly _totalFloats: number
  readonly _constantFactories: Record<string, () => unknown>
  readonly _node: (context: EffectNodeContext) => Node<'vec4'>
  readonly _initialized: boolean
  _nextId: number
  _initialize(): void
  buildNode(context: EffectNodeContext<S>): Node<'vec4'>
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
export function createMaterialEffect<
  const S extends EffectSchema,
  const C extends readonly ChannelName[] = readonly [],
>(config: MaterialEffectConfig<S, C>): MaterialEffectClass<S> {
  const { name, schema, node, provides: channelProvides, channelNode: channelNodeFn } = config

  // Create anonymous subclass with static fields
  const EffectClass = class extends MaterialEffect {
    static readonly effectName = name
    static readonly effectSchema = schema as EffectSchema
    static readonly provides: readonly ChannelName[] = channelProvides ?? []
    // Erase narrowed call-site types back to the storage surface (string, Node)
    // — the runtime dispatcher in buildMaterial() looks up by string channel
    // name and the pipeline resolves node types from ChannelNodeMap.
    static channelNode: ((ch: string, ctx: ChannelNodeContext) => Node) | null = channelNodeFn
      ? (ch: string, ctx: ChannelNodeContext) =>
          (channelNodeFn as unknown as (ch: string, ctx: ChannelNodeContext<S>) => Node)(
            ch,
            ctx as ChannelNodeContext<S>
          )
      : null
    static override _initialized: boolean = false

    static override buildNode(context: EffectNodeContext): Node<'vec4'> {
      if (node) return node(context as EffectNodeContext<S>)
      return context.inputColor
    }
  }

  // Give the class a readable name for debugging
  Object.defineProperty(EffectClass, 'name', { value: `${name}Effect` })

  return EffectClass as unknown as MaterialEffectClass<S>
}
