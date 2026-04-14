import { trait, type Entity, type Trait } from 'koota'
import { uniform } from 'three/tsl'
import { Vector2, Vector3, Vector4 } from 'three'
import type { OrthographicCamera, Texture } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ColorTransformContext } from '../materials/Sprite2DMaterial'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type { WebGPURenderer } from 'three/webgpu'
import type {
  EffectSchema,
  EffectSchemaValue,
  EffectField,
  EffectValues,
  EffectConstants,
  UniformKeys,
  SchemaToNodeType,
} from '../materials/MaterialEffect'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { ChannelName, WithRequiredChannels } from '../materials/channels'
import type { LightStore } from './LightStore'
import type { SDFGenerator } from './SDFGenerator'
import type { Light2D } from './Light2D'

// Re-export schema types for LightEffect consumers
export type { EffectSchema, EffectSchemaValue, EffectField, EffectValues, EffectConstants, UniformKeys }
// Re-export channel types for LightEffect consumers
export type { ChannelName, WithRequiredChannels }

// ============================================
// LightEffect Context Types
// ============================================

/** Compile-time context — passed to buildLightFn (called once on attach). */
export interface LightEffectBuildContext<S extends EffectSchema = EffectSchema> {
  /** TSL uniform nodes for each uniform schema field, keyed by field name. */
  uniforms: { [K in UniformKeys<S>]: SchemaToNodeType<S[K]> }
  /** Read-only constants from factory function fields. */
  constants: EffectConstants<S>
  /** The LightStore providing light data textures and count. */
  lightStore: LightStore
  /**
   * Stable reference to the scene's SDF texture. Non-null only when the
   * effect's class declared `needsShadows = true` — in that case Flatland
   * eagerly allocates the SDFGenerator before calling buildLightFn so the
   * reference is bindable in TSL `texture()` calls. The texture's RTs are
   * 1×1 placeholders at build time; the shadow pipeline system resizes
   * them on first frame and refreshes contents each subsequent frame,
   * without ever changing the reference.
   *
   * Null when the active effect doesn't declare `needsShadows` — shaders
   * should compile out the shadow path in that case (JS-level `if`, not
   * a GPU branch).
   */
  sdfTexture: Texture | null
  /**
   * Camera frustum width/height uniform node, updated each frame from the
   * camera bounds. Effects that map between world and UV space
   * (shadow sampling, radiance cascades, any other screen-projected
   * sampler) consume this instead of rolling their own uniform.
   */
  worldSizeNode: UniformNode<'vec2', Vector2>
  /**
   * Camera frustum bottom-left offset uniform node, updated each frame.
   */
  worldOffsetNode: UniformNode<'vec2', Vector2>
}

/** Runtime context — passed to init/update each frame. */
export interface LightEffectRuntimeContext {
  renderer: WebGPURenderer
  camera: OrthographicCamera
  lightStore: LightStore
  sdfGenerator: SDFGenerator | null
  lights: readonly Light2D[]
  worldSize: Vector2
  worldOffset: Vector2
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
 * from shared DataTextures managed by LightStore.
 *
 * Subclasses may also override lifecycle methods (init/update/resize/dispose)
 * to manage GPU resources like Forward+ tiling or Radiance Cascades.
 *
 * @example Class-based definition:
 * ```typescript
 * class DefaultLightEffect extends LightEffect {
 *   static readonly lightName = 'defaultLight'
 *   static readonly lightSchema = { ambientIntensity: 0.2 } as const
 *   static readonly needsShadows = false
 *   declare ambientIntensity: number
 *
 *   static buildLightFn({ uniforms, lightStore }: LightEffectBuildContext): ColorTransformFn {
 *     // build shader using lightStore.readLightData()
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
  /** Whether this effect needs the shadow/SDF pipeline. */
  static readonly needsShadows: boolean = false
  /** Per-fragment channels this effect requires (e.g., ['normal']). */
  static readonly requires: readonly ChannelName[] = []

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
  static buildLightFn(_context: LightEffectBuildContext): ColorTransformFn {
    throw new Error(`LightEffect.buildLightFn() not implemented for ${this.lightName}`)
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

    const schema = this.lightSchema
    if (!schema) {
      throw new Error(`LightEffect: ${this.name} is missing lightSchema`)
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

    // Build flattened trait schema for Koota (uniform fields only)
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

  /** @internal Per-instance constant values (from factory function schema fields). */
  _constants: Record<string, unknown> = {}

  /** @internal TSL uniform nodes — one per uniform schema field. */
  _uniforms: Record<string, UniformNodeValue>

  /** @internal Cached result of buildLightFn(). */
  _lightFn: ColorTransformFn | null = null

  /** @internal Whether this effect is enabled. */
  private _enabled = true

  /** @internal Whether init() has been called. */
  _initialized = false

  /** @internal Whether uniform/structural state changed since last clearDirty(). */
  _dirty = false

  /** @internal Callback invoked when dirty state changes (set by _attach). */
  _onDirty: (() => void) | null = null

  constructor() {
    const ctor = this.constructor as typeof LightEffect

    // Lazy initialize static metadata
    ctor._initialize()

    this.name = ctor.lightName

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

  /** Whether this effect is enabled. */
  get enabled(): boolean {
    return this._enabled
  }

  /** Toggle enabled state. Structural change — marks lighting dirty. */
  set enabled(value: boolean) {
    if (this._enabled === value) return
    this._enabled = value
    this._dirty = true
    this._onDirty?.()
    if (this._flatland) {
      this._flatland._markLightingDirty()
    }
  }

  /** Whether this effect has been marked dirty since last clearDirty(). */
  get dirty(): boolean {
    return this._dirty
  }

  /** Clear the dirty flag. Called by lighting systems after processing. */
  clearDirty(): void {
    this._dirty = false
  }

  // ============================================
  // Lifecycle methods (overridden by subclasses that own GPU resources)
  // ============================================

  /** Initialize GPU resources. Called lazily on first render. */
  init(_ctx: LightEffectRuntimeContext): void {}

  /** Per-frame GPU passes (tiling, SDF, radiance cascades). */
  update(_ctx: LightEffectRuntimeContext): void {}

  /** Handle resize. */
  resize(_width: number, _height: number): void {}

  // ============================================
  // Internal lifecycle
  // ============================================

  /**
   * Attach this effect to a Flatland instance.
   * @internal Called by Flatland.setLighting()
   */
  _attach(flatland: FlatlandLike, onDirty?: () => void): void {
    this._flatland = flatland
    this._onDirty = onDirty ?? null
  }

  /**
   * Detach this effect from its Flatland instance.
   * @internal Called by Flatland when lighting is replaced
   */
  _detach(): void {
    this._flatland = null
    this._entity = null
    this._lightFn = null
    this._initialized = false
    this._onDirty = null
    this._dirty = false
  }

  /**
   * Build the ColorTransformFn for standalone use (no Flatland, no ECS).
   *
   * Returns the lighting function that can be assigned directly to a
   * sprite material's `colorTransform`. For batched sprites, wrap with
   * `wrapWithLightFlags()` to gate per-instance.
   *
   * @example
   * ```typescript
   * const lightStore = new LightStore()
   * const lighting = new DefaultLightEffect()
   * const lightFn = lighting.build(lightStore)
   *
   * sprite.material.colorTransform = lightFn
   * sprite.material.requiredChannels = new Set(DefaultLightEffect.requires)
   * ```
   */
  build(
    lightStore: LightStore,
    worldSizeNode: UniformNode<'vec2', Vector2>,
    worldOffsetNode: UniformNode<'vec2', Vector2>,
    sdfTexture: Texture | null = null
  ): ColorTransformFn {
    return this._buildLightFn(lightStore, worldSizeNode, worldOffsetNode, sdfTexture)
  }

  /**
   * Build and cache the light function by calling the static buildLightFn() once.
   * The returned function closes over uniform nodes, constants, world bounds,
   * and the stable SDF texture reference (if shadows are needed).
   * @internal
   */
  _buildLightFn(
    lightStore: LightStore,
    worldSizeNode: UniformNode<'vec2', Vector2>,
    worldOffsetNode: UniformNode<'vec2', Vector2>,
    sdfTexture: Texture | null = null
  ): ColorTransformFn {
    if (!this._lightFn) {
      const ctor = this.constructor as typeof LightEffect
      this._lightFn = ctor.buildLightFn({
        uniforms: this._uniforms,
        constants: this._constants,
        lightStore,
        sdfTexture,
        worldSizeNode,
        worldOffsetNode,
      })
    }
    return this._lightFn
  }

  /**
   * Dispose GPU resources owned by this effect.
   * Override in subclasses that own ForwardPlusLighting, RadianceCascades, etc.
   */
  dispose(): void {}

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

/** Instance type for lifecycle hook `this` binding. */
type LightEffectInstance<S extends EffectSchema> = LightEffect & EffectValues<S> & EffectConstants<S>

/** Configuration passed to createLightEffect(). */
interface LightEffectConfig<
  S extends EffectSchema,
  C extends readonly ChannelName[] = readonly [],
> {
  /** Unique name for this light effect. */
  name: string
  /** Per-effect data schema — default values define types and initial values. */
  schema: S
  /** Whether this effect needs the shadow/SDF pipeline. */
  needsShadows?: boolean
  /** Per-fragment channels this effect requires (e.g., ['normal'] as const). */
  requires?: C
  /**
   * Light builder: receives uniform nodes + light store, returns a ColorTransformFn.
   * The returned callback's context is narrowed based on `requires` —
   * e.g., `requires: ['normal']` guarantees `ctx.normal` is `Node<'vec3'>`.
   */
  light: (context: LightEffectBuildContext<S>) =>
    (ctx: ColorTransformContext & WithRequiredChannels<C>) =>
      Node<'vec4'>

  // Lifecycle hooks (optional) — `this` is the effect instance
  /** Initialize GPU resources. Called lazily on first render. */
  init?: (this: LightEffectInstance<S>, ctx: LightEffectRuntimeContext) => void
  /** Per-frame GPU passes (tiling, SDF, radiance cascades). */
  update?: (this: LightEffectInstance<S>, ctx: LightEffectRuntimeContext) => void
  /** Handle resize. */
  resize?: (this: LightEffectInstance<S>, width: number, height: number) => void
  /** Dispose GPU resources. */
  dispose?: (this: LightEffectInstance<S>) => void
}

/**
 * Type for a LightEffect class created by the factory.
 * Instances have typed properties matching the schema.
 */
export type LightEffectClass<S extends EffectSchema> = {
  new (): LightEffect & EffectValues<S> & EffectConstants<S>
  readonly lightName: string
  readonly lightSchema: S
  readonly needsShadows: boolean
  readonly requires: readonly ChannelName[]
  readonly _trait: Trait
  readonly _fields: EffectField[]
  readonly _totalFloats: number
  readonly _constantFactories: Record<string, () => unknown>
  readonly _initialized: boolean
  _initialize(): void
  buildLightFn(context: LightEffectBuildContext<S>): ColorTransformFn
}

/**
 * Create a LightEffect class from a configuration object.
 *
 * Supports lifecycle hooks (init/update/resize/dispose) for effects that
 * manage GPU resources. Use factory function fields in the schema for
 * per-instance constants (e.g., ForwardPlusLighting, RadianceCascades).
 *
 * @example
 * ```typescript
 * const DefaultLightEffect = createLightEffect({
 *   name: 'defaultLight',
 *   schema: { ambientIntensity: 0.2 },
 *   light: ({ uniforms, lightStore }) => {
 *     // build light loop using lightStore.readLightData()
 *   },
 * })
 *
 * const lighting = new DefaultLightEffect()
 * flatland.setLighting(lighting)
 * lighting.ambientIntensity = 0.4  // zero-cost uniform update
 * ```
 */
export function createLightEffect<
  const S extends EffectSchema,
  const C extends readonly ChannelName[] = readonly [],
>(
  config: LightEffectConfig<S, C>
): LightEffectClass<S> {
  const {
    name,
    schema,
    needsShadows: shadows = false,
    requires: requiredChannels = [] as unknown as C,
    light: lightFn,
    init: initHook,
    update: updateHook,
    resize: resizeHook,
    dispose: disposeHook,
  } = config

  const EffectClass = class extends LightEffect {
    static readonly lightName = name
    static readonly lightSchema = schema as EffectSchema
    static override readonly needsShadows = shadows
    static override readonly requires = requiredChannels as readonly ChannelName[]
    static override _initialized: boolean = false

    static override buildLightFn(context: LightEffectBuildContext): ColorTransformFn {
      // Cast is safe: pipeline guarantees channels are resolved before calling
      return lightFn(context as LightEffectBuildContext<S>) as unknown as ColorTransformFn
    }

    override init(ctx: LightEffectRuntimeContext): void {
      if (initHook) initHook.call(this as unknown as LightEffectInstance<S>, ctx)
    }

    override update(ctx: LightEffectRuntimeContext): void {
      if (updateHook) updateHook.call(this as unknown as LightEffectInstance<S>, ctx)
    }

    override resize(width: number, height: number): void {
      if (resizeHook) resizeHook.call(this as unknown as LightEffectInstance<S>, width, height)
    }

    override dispose(): void {
      if (disposeHook) disposeHook.call(this as unknown as LightEffectInstance<S>)
    }
  }

  Object.defineProperty(EffectClass, 'name', { value: `${name}Effect` })

  return EffectClass as unknown as LightEffectClass<S>
}
