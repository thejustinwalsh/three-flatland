import {
  Mesh,
  PlaneGeometry,
  Vector2,
  Vector3,
  Color,
  BufferAttribute,
  type Texture,
} from 'three'
import type { Entity, World } from 'koota'
import type { MaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { Sprite2DOptions, SpriteFrame } from './types'
import {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SpriteLayer,
  SpriteZIndex,
  SpriteMaterialRef,
  IsRenderable,
  IsBatched,
  BatchSlot,
  BatchRegistry,
} from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import { ENTITY_ID_MASK, resolveStore } from '../ecs/snapshot'
import { getGlobalWorld } from '../ecs/world'

// ============================================
// Observable property helpers
// ============================================
//
// Convert data properties (x/y/z, r/g/b) on Three.js objects to accessor
// properties that fire a callback on write. Replaces the generic Proxy approach
// with zero per-instance function allocations — descriptors are shared at
// module level and reuse `this._cb` on the instance.
//
// Works because ALL Three.js Vector3/Color/Vector2 methods mutate via
// `this.x = ...` etc., so the accessor setters catch every mutation path.

/** @internal */
interface Observable { _cb: () => void }

const _vec2Desc: PropertyDescriptorMap = {
  x: {
    get(this: Observable & { _ox: number }) { return this._ox },
    set(this: Observable & { _ox: number }, v: number) { this._ox = v; this._cb() },
    configurable: true, enumerable: true,
  },
  y: {
    get(this: Observable & { _oy: number }) { return this._oy },
    set(this: Observable & { _oy: number }, v: number) { this._oy = v; this._cb() },
    configurable: true, enumerable: true,
  },
}

const _colorDesc: PropertyDescriptorMap = {
  r: {
    get(this: Observable & { _or: number }) { return this._or },
    set(this: Observable & { _or: number }, v: number) { this._or = v; this._cb() },
    configurable: true, enumerable: true,
  },
  g: {
    get(this: Observable & { _og: number }) { return this._og },
    set(this: Observable & { _og: number }, v: number) { this._og = v; this._cb() },
    configurable: true, enumerable: true,
  },
  b: {
    get(this: Observable & { _ob: number }) { return this._ob },
    set(this: Observable & { _ob: number }, v: number) { this._ob = v; this._cb() },
    configurable: true, enumerable: true,
  },
}

/** Convert a Vector2's x/y data properties to callback-firing accessors in place. */
function observeVector2(v: Vector2, cb: () => void): void {
  const a = v as unknown as Record<string, unknown>
  a._ox = v.x; a._oy = v.y; a._cb = cb
  Object.defineProperties(v, _vec2Desc)
}

/** Convert a Color's r/g/b data properties to callback-firing accessors in place. */
function observeColor(c: Color, cb: () => void): void {
  const a = c as unknown as Record<string, unknown>
  a._or = c.r; a._og = c.g; a._ob = c.b; a._cb = cb
  Object.defineProperties(c, _colorDesc)
}

/**
 * System flag layout for `_effectFlags` now lives in a neutral module
 * so `EffectMaterial` can consume the same constants without creating a
 * Sprite2D → Sprite2DMaterial → EffectMaterial → Sprite2D cycle.
 * Re-exported here so existing `import { LIT_FLAG_MASK } from '.../Sprite2D'`
 * call sites keep working.
 */
export {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
  EFFECT_BIT_OFFSET,
} from '../materials/effectFlagBits'
import {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
} from '../materials/effectFlagBits'

/** Size in floats for each attribute type. */
const ATTR_TYPE_SIZES: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 }

/**
 * A 2D sprite for use with three-flatland's render pipeline.
 *
 * Extends THREE.Mesh, so it works with standard Three.js scene graph
 * but designed for batched 2D rendering with explicit z-ordering.
 *
 * **Two rendering modes:**
 * - **Standalone** (not enrolled): Setters write to snapshot + own geometry buffers immediately.
 * - **Batched** (enrolled in SpriteGroup): Setters write to ECS traits only.
 *   Systems sync traits to batch buffers in `updateMatrixWorld()`.
 *
 * @example
 * ```typescript
 * const sprite = new Sprite2D({
 *   texture: myTexture,
 *   frame: spriteSheet.getFrame('player_idle'),
 *   anchor: [0.5, 1], // Bottom center
 * });
 * sprite.position.set(100, 200, 0);
 * sprite.layer = Layers.ENTITIES;
 * sprite.zIndex = sprite.position.y; // Y-sort
 * scene.add(sprite);
 * ```
 */
export class Sprite2D extends Mesh {
  declare geometry: PlaneGeometry
  declare material: Sprite2DMaterial


  /**
   * Own-geometry buffers for custom attributes (unbatched rendering).
   * Each entry maps an attribute name to its Float32Array (4 vertices) and component size.
   * @internal
   */
  private _customBuffers: Map<string, { buffer: Float32Array; size: number }> = new Map()

  /** Stored tint color — observable proxy for R3F compat. */
  private _tintColor: Color = new Color()

  /** Anchor point (0-1) — observable proxy for R3F compat. */
  private _anchor: Vector2 = new Vector2(0.5, 0.5)

  /** Current frame */
  private _frame: SpriteFrame | null = null

  /** Source texture */
  private _texture: Texture | null = null


  /** Pixel-perfect mode */
  pixelPerfect: boolean = false

  /**
   * Whether this sprite receives lighting from Flatland's LightEffect.
   * Stored as bit 0 of `_effectFlags` so lit/unlit sprites with the same
   * texture share the same material and batch together.
   * Default: `true` — set `lit = false` to opt out.
   */
  get lit(): boolean {
    return (this._effectFlags & LIT_FLAG_MASK) !== 0
  }

  set lit(value: boolean) {
    const was = (this._effectFlags & LIT_FLAG_MASK) !== 0
    if (was === value) return

    if (value) {
      this._effectFlags |= LIT_FLAG_MASK
    } else {
      this._effectFlags &= ~LIT_FLAG_MASK
    }

    // Sync to GPU buffers
    if (this._entity) {
      this._syncEffectFlagsToBatch()
    } else {
      this._writeEffectDataOwn()
    }
  }

  /**
   * Whether this sprite receives shadows from the SDF shadow pipeline.
   * Stored as bit 1 of `_effectFlags`.
   * Default: `true` — set `receiveShadows = false` to opt out.
   */
  get receiveShadows(): boolean {
    return (this._effectFlags & RECEIVE_SHADOWS_MASK) !== 0
  }

  set receiveShadows(value: boolean) {
    const was = (this._effectFlags & RECEIVE_SHADOWS_MASK) !== 0
    if (was === value) return

    if (value) {
      this._effectFlags |= RECEIVE_SHADOWS_MASK
    } else {
      this._effectFlags &= ~RECEIVE_SHADOWS_MASK
    }

    // Sync to GPU buffers
    if (this._entity) {
      this._syncEffectFlagsToBatch()
    } else {
      this._writeEffectDataOwn()
    }
  }

  /**
   * Per-sprite occluder radius used by shadow-casting effects (world
   * units). Consumed by any LightEffect that needs to know "how big is
   * this sprite as an occluder" — the SDF sphere-tracer uses it as the
   * self-silhouette escape distance; a future shadow-map effect would
   * use it for depth bias; an AO pass could use it as sample radius.
   *
   * `undefined` (default) means auto-resolve from `max(scale.x, scale.y)`
   * at batch-write time — tracks scale changes automatically, covers
   * sprite animation frames whose source size differs (AnimatedSprite2D
   * updates `scale` from `frame.sourceWidth/Height`). Assign a number
   * to override — useful when the visible body is tighter than the
   * quad's bounds or when the anchor pushes the silhouette off-center.
   */
  private _shadowRadius: number | undefined = undefined

  get shadowRadius(): number | undefined {
    return this._shadowRadius
  }

  set shadowRadius(value: number | undefined) {
    if (this._shadowRadius === value) return
    this._shadowRadius = value
    // Push to GPU: standalone writes the own-geometry buffer; batched
    // lets transformSyncSystem pick it up on the next frame (it reads
    // scale + override together when resolving the per-slot value).
    if (this._entity) {
      this._syncShadowRadiusToBatch()
    } else {
      this._updateOwnShadowRadius()
    }
  }

  /**
   * Whether this sprite contributes its silhouette to the shadow-caster
   * occlusion pre-pass. Stored as bit 2 of `_effectFlags`. Default: `false`
   * — most sprites don't cast; opt in by setting to `true`.
   *
   * Consumed by the occlusion pre-pass shader, which masks the sprite's
   * alpha by this bit before the SDF seed. Flipping it takes effect on
   * the next frame with zero CPU rebuild (same model as `receiveShadows`).
   */
  get castsShadow(): boolean {
    return (this._effectFlags & CAST_SHADOW_MASK) !== 0
  }

  set castsShadow(value: boolean) {
    const was = (this._effectFlags & CAST_SHADOW_MASK) !== 0
    if (was === value) return

    if (value) {
      this._effectFlags |= CAST_SHADOW_MASK
    } else {
      this._effectFlags &= ~CAST_SHADOW_MASK
    }

    // Sync to GPU buffers
    if (this._entity) {
      this._syncEffectFlagsToBatch()
    } else {
      this._writeEffectDataOwn()
    }
  }

  // ============================================
  // EFFECT STATE
  // ============================================

  /**
   * System-flag bitmask written to `effectBuf0.x`.
   *
   * Bits:
   *   0 — lit             (default on)
   *   1 — receiveShadows  (default on)
   *   2 — castsShadow     (default off, opt in)
   *   3..23 — reserved for future system flags
   *
   * MaterialEffect enable bits live in a separate field
   * ({@link _effectEnableBits}) written to `effectBuf0.y`.
   * @internal
   */
  _effectFlags: number = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK

  /**
   * MaterialEffect enable-bit bitmask written to `effectBuf0.y`.
   *
   * Bit N is set while the Nth registered MaterialEffect on this sprite's
   * material is currently active. 24 slots, bits 0..23. Separate from
   * {@link _effectFlags} so system flags don't compete with user-defined
   * effect capacity.
   * @internal
   */
  _effectEnableBits: number = 0

  /**
   * Active MaterialEffect instances on this sprite.
   * @internal
   */
  _effects: MaterialEffect[] = []

  // ============================================
  // ECS STATE — Array-ref swap pattern
  // ============================================
  //
  // Each numeric trait field has a backing array ref + index.
  // Standalone: refs point to local arrays (length >= 1), _idx = 0.
  // Enrolled: refs point to world SoA store arrays, _idx = eid.
  // Enrollment swaps refs + copies values. Zero branching in setters.

  /** Index into the backing arrays (0 when standalone, eid when enrolled). */
  _idx = 0

  // UV (SpriteUV) — raw array writes, no Changed() needed
  /** @internal */ _uvX: number[] = [0]
  /** @internal */ _uvY: number[] = [0]
  /** @internal */ _uvW: number[] = [1]
  /** @internal */ _uvH: number[] = [1]

  // Color (SpriteColor) — needs entity.set() for Changed() on write
  /** @internal */ _colorR: number[] = [1]
  /** @internal */ _colorG: number[] = [1]
  /** @internal */ _colorB: number[] = [1]
  /** @internal */ _colorA: number[] = [1]

  // Flip (SpriteFlip) — needs entity.set() for Changed() on write
  /** @internal */ _flipXArr: number[] = [1]
  /** @internal */ _flipYArr: number[] = [1]

  // Layer (SpriteLayer) — needs entity.set() for Changed() on write
  /** @internal */ _layerArr: number[] = [0]

  // ZIndex (SpriteZIndex) — raw array writes, no Changed() needed
  /** @internal */ _zIndexArr: number[] = [0]

  /**
   * The ECS entity for this sprite (null until enrolled in a world).
   * @internal
   */
  _entity: Entity | null = null

  /**
   * The ECS world this sprite belongs to (set by SpriteGroup or Flatland).
   * @internal
   */
  _flatlandWorld: World | null = null

  /** Custom geometry for anchor offset */
  private _geometry: PlaneGeometry | null = null

  /**
   * Instance attribute buffers for single-sprite rendering.
   * PlaneGeometry has 4 vertices, so we need 4 copies of each value.
   */
  // instanceUV: 4 vertices x vec4 = 16 floats
  private _instanceUVBuffer: Float32Array = new Float32Array([
    0, 0, 1, 1, // vertex 0
    0, 0, 1, 1, // vertex 1
    0, 0, 1, 1, // vertex 2
    0, 0, 1, 1, // vertex 3
  ])
  // instanceColor: 4 vertices x vec4 = 16 floats
  private _instanceColorBuffer: Float32Array = new Float32Array([
    1, 1, 1, 1, // vertex 0
    1, 1, 1, 1, // vertex 1
    1, 1, 1, 1, // vertex 2
    1, 1, 1, 1, // vertex 3
  ])
  // instanceFlip: 4 vertices x vec2 = 8 floats
  private _instanceFlipBuffer: Float32Array = new Float32Array([
    1, 1, // vertex 0
    1, 1, // vertex 1
    1, 1, // vertex 2
    1, 1, // vertex 3
  ])
  // instanceShadowRadius: 4 vertices x float = 4 floats. Same value per
  // vertex — the attribute is effectively per-instance; replicating it
  // across the quad's 4 verts matches three.js's standard
  // per-instance-as-per-vertex pattern for non-InstancedMesh geometry.
  // Populated from `_shadowRadius` (user override) or auto-resolved at
  // write time from `max(scale.x, scale.y)`.
  private _instanceShadowRadiusBuffer: Float32Array = new Float32Array([0, 0, 0, 0])

  /**
   * Create a new Sprite2D.
   * Can be called with no arguments for R3F compatibility - set texture via property.
   */
  constructor(options?: Sprite2DOptions) {
    // Resolve material: explicit > shared-by-texture > new private
    let material: Sprite2DMaterial
    if (options?.material) {
      material = options.material
    } else if (options?.texture) {
      material = Sprite2DMaterial.getShared({
        map: options.texture,
        transparent: true,
      })
    } else {
      material = new Sprite2DMaterial({ transparent: true })
    }

    // Create geometry with instance attributes for single-sprite rendering
    // (Cannot use shared geometry because each sprite needs its own attribute buffers)
    const geometry = new PlaneGeometry(1, 1)
    super(geometry, material)

    // Store reference so we can dispose it
    this._geometry = geometry

    // Convert stored Color/Vector2 to observable accessors.
    // Position/rotation/scale are NOT observed — accessor overhead on these
    // hot properties (read/written millions of times per frame in game loops)
    // costs more than it saves. transformSyncSystem reads directly from Object3D.
    observeColor(this._tintColor, () => {
      const i = this._idx
      this._colorR[i] = this._tintColor.r
      this._colorG[i] = this._tintColor.g
      this._colorB[i] = this._tintColor.b
      if (this._entity) {
        this._entity.set(SpriteColor, {
          r: this._tintColor.r,
          g: this._tintColor.g,
          b: this._tintColor.b,
        })
      } else {
        this._updateOwnColor()
      }
    })
    observeVector2(this._anchor, () => this.updateAnchor())

    // Set up instance attributes on the geometry
    this._setupInstanceAttributes()

    // Frustum culling friendly name
    this.name = 'Sprite2D'
    this.frustumCulled = true

    // Hide until properly configured (prevents flash on load)
    this.visible = false

    // If no options, we're being created by R3F - properties will be set via setters
    if (!options) {
      return
    }

    this._texture = options.texture ?? null

    // Ensure material has the texture set
    if (!options.material && options.texture) {
      material.setTexture(options.texture)
    }

    // Apply options
    if (options.frame) {
      this.setFrame(options.frame)
    } else if (options.texture) {
      // Default to full texture
      this._frame = {
        name: '__full__',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceWidth: (options.texture.image as HTMLImageElement | undefined)?.width ?? 1,
        sourceHeight: (options.texture.image as HTMLImageElement | undefined)?.height ?? 1,
      }
      this._updateOwnUV()
      this.updateSize()
      this.visible = true
    }

    if (options.anchor) {
      this.setAnchor(
        Array.isArray(options.anchor) ? options.anchor[0] : options.anchor.x,
        Array.isArray(options.anchor) ? options.anchor[1] : options.anchor.y
      )
    }

    if (options.tint !== undefined) {
      this.tint = options.tint
    }

    if (options.alpha !== undefined) {
      this.alpha = options.alpha
    }

    if (options.flipX !== undefined) {
      this.flipX = options.flipX
    }

    if (options.flipY !== undefined) {
      this.flipY = options.flipY
    }

    if (options.layer !== undefined) {
      this.layer = options.layer
    }

    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex
    }

    if (options.pixelPerfect !== undefined) {
      this.pixelPerfect = options.pixelPerfect
    }

    if (options.lit === false) {
      this._effectFlags &= ~LIT_FLAG_MASK
    }

    if (options.receiveShadows === false) {
      this._effectFlags &= ~RECEIVE_SHADOWS_MASK
    }

    if (options.castsShadow === true) {
      this._effectFlags |= CAST_SHADOW_MASK
    }

    if (options.shadowRadius !== undefined) {
      this._shadowRadius = options.shadowRadius
    }

    this._updateOwnFlip()
    this._updateOwnShadowRadius()
  }

  /**
   * Resolve the effective shadow radius for this sprite — either the
   * explicit user override or the auto-derived `max(scale.x, scale.y)`.
   * Called by both the standalone path (_updateOwnShadowRadius) and
   * `transformSyncSystem` when populating the batch's per-instance
   * `instanceShadowRadius` attribute.
   * @internal
   */
  _resolveShadowRadius(): number {
    if (this._shadowRadius !== undefined) return this._shadowRadius
    const sx = Math.abs(this.scale.x)
    const sy = Math.abs(this.scale.y)
    return sx > sy ? sx : sy
  }

  /**
   * Write the resolved shadow radius to the own-geometry buffer
   * (standalone mode — not enrolled in a SpriteGroup).
   * @internal
   */
  private _updateOwnShadowRadius() {
    const r = this._resolveShadowRadius()
    this._instanceShadowRadiusBuffer[0] = r
    this._instanceShadowRadiusBuffer[1] = r
    this._instanceShadowRadiusBuffer[2] = r
    this._instanceShadowRadiusBuffer[3] = r
    const attr = this.geometry.getAttribute('instanceShadowRadius') as
      | BufferAttribute
      | undefined
    if (attr) attr.needsUpdate = true
  }

  /**
   * Push the resolved shadow radius to the enrolled SpriteBatch's
   * per-instance buffer. Used when `shadowRadius` is imperatively set
   * by user code; the per-frame `transformSyncSystem` also writes this
   * value as part of the transform sync so scale-driven auto values
   * stay in lockstep with `instanceMatrix`.
   * @internal
   */
  private _syncShadowRadiusToBatch() {
    if (!this._entity || !this._flatlandWorld) return
    const bs = this._entity.get(BatchSlot) as { batchIdx: number; slot: number } | undefined
    if (!bs || bs.batchIdx < 0) return
    const registryEntities = this._flatlandWorld.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as
      | { batchSlots: readonly unknown[] }
      | undefined
    if (!registry) return
    const mesh = registry.batchSlots[bs.batchIdx] as
      | { writeShadowRadius(i: number, v: number): void }
      | undefined
    mesh?.writeShadowRadius(bs.slot, this._resolveShadowRadius())
  }

  /**
   * Get the current texture.
   */
  get texture(): Texture | null {
    return this._texture
  }

  /**
   * Set a new texture.
   */
  set texture(value: Texture | null) {
    this._texture = value
    if (value) {
      this.material.setTexture(value)
      // Set default frame if none exists
      if (!this._frame) {
        this._frame = {
          name: '__full__',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          sourceWidth: (value.image as HTMLImageElement | undefined)?.width ?? 1,
          sourceHeight: (value.image as HTMLImageElement | undefined)?.height ?? 1,
        }
        if (!this._entity) this._updateOwnUV()
        this.updateSize()
      }
      // Show sprite once texture is set
      this.visible = true
    }
  }

  /**
   * Build a stable cache key fragment from effect constants.
   * Uses texture ID for Textures, String() for primitives.
   * @internal
   */
  private _constantsKey(constants: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(constants)) {
      if (value && typeof value === 'object' && 'id' in value) {
        parts.push(`${key}=${(value as { id: number }).id}`)
      } else if (value == null) {
        parts.push(`${key}=null`)
      } else {
        parts.push(`${key}=${typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : 'ref'}`)
      }
    }
    return parts.join(',')
  }

  /**
   * Switch to a different shared material, carrying over all state.
   * @internal
   */
  private _switchToMaterial(newMaterial: Sprite2DMaterial): void {
    const current = this.material
    this.material = newMaterial

    // Carry over global uniforms
    if (current.globalUniforms) {
      newMaterial.globalUniforms = current.globalUniforms
    }
    // Carry over required channels and color transform
    newMaterial.requiredChannels = current.requiredChannels
    newMaterial.colorTransform = current.colorTransform

    // Re-register all effects on the new material
    for (const effect of this._effects) {
      const EffectClass = effect.constructor as typeof MaterialEffect
      if (!newMaterial.hasEffect(EffectClass)) {
        newMaterial.registerEffect(EffectClass, effect._constants)
      }
    }

    // Update SpriteMaterialRef for batch reassignment
    if (this._entity) {
      this._entity.set(SpriteMaterialRef, { materialId: newMaterial.batchId })
    }
    this._setupInstanceAttributes()
    if (!this._entity) {
      this._writeEffectDataOwn()
    }
  }

  /**
   * Get the current frame.
   */
  get frame(): SpriteFrame | null {
    return this._frame
  }

  /**
   * Set the current frame (R3F prop compatibility).
   */
  set frame(value: SpriteFrame | null) {
    if (value) {
      this.setFrame(value)
    }
  }

  /**
   * Set the current frame.
   * Note: Does not modify scale - call updateSize() manually if needed after first frame.
   */
  setFrame(frame: SpriteFrame): this {
    const isFirstFrame = this._frame === null
    this._frame = frame
    // Raw array writes — zero function calls, zero getStore, zero branching.
    // UV is synced unconditionally in transformSyncSystem, no Changed() needed.
    const i = this._idx
    this._uvX[i] = frame.x
    this._uvY[i] = frame.y
    this._uvW[i] = frame.width
    this._uvH[i] = frame.height
    if (!this._entity) this._updateOwnUV()
    // Only auto-size on first frame set (not during animation)
    if (isFirstFrame) {
      this.updateSize()
    }
    // Show sprite once it has a valid frame
    this.visible = true
    return this
  }

  /**
   * Get the anchor point. Returns the stored Vector2 (like Object3D.position).
   */
  get anchor(): Vector2 {
    return this._anchor
  }

  /**
   * Set the anchor point. Accepts [x, y] array or Vector2.
   */
  set anchor(value: Vector2 | [number, number]) {
    if (Array.isArray(value)) {
      this.setAnchor(value[0], value[1])
    } else {
      this.setAnchor(value.x, value.y)
    }
  }

  /**
   * Set the anchor point (0-1).
   * (0, 0) = top-left, (0.5, 0.5) = center, (0.5, 1) = bottom-center
   */
  setAnchor(x: number, y: number): this {
    this._anchor.set(x, y)
    this.updateAnchor()
    return this
  }

  /**
   * Get tint color. Returns a stored Color reference (like Material.color).
   * Mutating the returned Color triggers ECS sync via onChange callback.
   */
  get tint(): Color {
    return this._tintColor
  }

  /**
   * Set tint color. Accepts Color, hex string, hex number, or [r, g, b] array (0-1).
   */
  set tint(value: Color | string | number | [number, number, number]) {
    if (Array.isArray(value)) {
      this._tintColor.setRGB(value[0], value[1], value[2])
    } else if (value instanceof Color) {
      this._tintColor.copy(value)
    } else {
      this._tintColor.set(value)
    }
    // onChange callback handles ECS sync
  }

  /**
   * Get alpha/opacity.
   */
  get alpha(): number {
    return this._colorA[this._idx]!
  }

  /**
   * Set alpha/opacity (0-1).
   */
  set alpha(value: number) {
    this._colorA[this._idx] = value
    if (this._entity) {
      this._entity.set(SpriteColor, { a: value })
    } else {
      this._updateOwnColor()
    }
  }

  /**
   * Get flipX state.
   */
  get flipX(): boolean {
    return this._flipXArr[this._idx]! === -1
  }

  /**
   * Set flipX state.
   */
  set flipX(value: boolean) {
    const numVal = value ? -1 : 1
    if (this._flipXArr[this._idx]! === numVal) return
    this._flipXArr[this._idx] = numVal
    if (this._entity) {
      this._entity.set(SpriteFlip, { x: numVal })
    } else {
      this._updateOwnFlip()
    }
  }

  /**
   * Get flipY state.
   */
  get flipY(): boolean {
    return this._flipYArr[this._idx]! === -1
  }

  /**
   * Set flipY state.
   */
  set flipY(value: boolean) {
    const numVal = value ? -1 : 1
    if (this._flipYArr[this._idx]! === numVal) return
    this._flipYArr[this._idx] = numVal
    if (this._entity) {
      this._entity.set(SpriteFlip, { y: numVal })
    } else {
      this._updateOwnFlip()
    }
  }

  /**
   * Flip the sprite.
   */
  flip(horizontal: boolean, vertical: boolean): this {
    const i = this._idx
    this._flipXArr[i] = horizontal ? -1 : 1
    this._flipYArr[i] = vertical ? -1 : 1
    if (this._entity) {
      this._entity.set(SpriteFlip, {
        x: horizontal ? -1 : 1,
        y: vertical ? -1 : 1,
      })
    } else {
      this._updateOwnFlip()
    }
    return this
  }

  /**
   * Get render layer (primary sort key).
   */
  get layer(): number {
    return this._layerArr[this._idx]!
  }

  /**
   * Set render layer (primary sort key).
   */
  set layer(value: number) {
    this._layerArr[this._idx] = value
    if (this._entity) {
      this._entity.set(SpriteLayer, { layer: value })
    }
  }

  /**
   * Get z-index within layer (secondary sort key).
   */
  get zIndex(): number {
    return this._zIndexArr[this._idx]!
  }

  /**
   * Set z-index within layer (secondary sort key).
   */
  set zIndex(value: number) {
    this._zIndexArr[this._idx] = value
  }

  /**
   * Get the width of the sprite in world units.
   */
  get width(): number {
    return this._frame?.sourceWidth ?? 1
  }

  /**
   * Get the height of the sprite in world units.
   */
  get height(): number {
    return this._frame?.sourceHeight ?? 1
  }

  /**
   * Update the mesh scale based on frame size.
   */
  private updateSize() {
    if (this._frame) {
      this.scale.set(this._frame.sourceWidth, this._frame.sourceHeight, 1)
    }
  }

  /**
   * Update geometry offset based on anchor.
   */
  private updateAnchor() {
    // Offset position to account for anchor
    const offsetX = 0.5 - this._anchor.x
    const offsetY = 0.5 - this._anchor.y

    // Dispose old geometry
    if (this._geometry) {
      this._geometry.dispose()
    }

    // Create new geometry with offset
    this._geometry = new PlaneGeometry(1, 1)
    this._geometry.translate(offsetX, offsetY, 0)
    this.geometry = this._geometry

    // Re-setup instance attributes on the new geometry
    this._setupInstanceAttributes()
  }

  /**
   * Update flip flags in own geometry buffer (standalone mode).
   */
  private _updateOwnFlip() {
    const idx = this._idx
    const fx = this._flipXArr[idx]!
    const fy = this._flipYArr[idx]!
    for (let i = 0; i < 4; i++) {
      this._instanceFlipBuffer[i * 2 + 0] = fx
      this._instanceFlipBuffer[i * 2 + 1] = fy
    }
    const flipAttr = this.geometry.getAttribute('instanceFlip') as BufferAttribute
    if (flipAttr) {
      flipAttr.needsUpdate = true
    }
  }

  /**
   * Set up instance attributes on the geometry for single-sprite rendering.
   * These are the same attributes used by SpriteBatch for batched rendering.
   * Also allocates buffers for custom attributes from the material's schema
   * (including effectBuf0, effectBuf1, ... for packed effect data).
   */
  _setupInstanceAttributes() {
    const geo = this.geometry

    // Core instance attributes (persistent buffers)
    geo.setAttribute('instanceUV', new BufferAttribute(this._instanceUVBuffer, 4))
    geo.setAttribute('instanceColor', new BufferAttribute(this._instanceColorBuffer, 4))
    geo.setAttribute('instanceFlip', new BufferAttribute(this._instanceFlipBuffer, 2))
    geo.setAttribute('instanceShadowRadius', new BufferAttribute(this._instanceShadowRadiusBuffer, 1))

    // Custom attributes from material schema (effects add these)
    this._customBuffers.clear()
    const schema = this.material.getInstanceAttributeSchema()
    for (const [name, config] of schema) {
      const size = ATTR_TYPE_SIZES[config.type] ?? 1
      const buffer = new Float32Array(4 * size)

      // Fill with defaults from schema
      const values = Array.isArray(config.defaultValue) ? config.defaultValue : [config.defaultValue]
      for (let v = 0; v < 4; v++) {
        for (let c = 0; c < size; c++) {
          buffer[v * size + c] = values[c] ?? 0
        }
      }

      this._customBuffers.set(name, { buffer, size })
      geo.setAttribute(name, new BufferAttribute(buffer, size))
    }
  }

  /**
   * Update the instanceUV attribute from current frame.
   * Writes to own geometry buffer only (standalone mode).
   */
  private _updateOwnUV() {
    const idx = this._idx
    const x = this._uvX[idx]!
    const y = this._uvY[idx]!
    const w = this._uvW[idx]!
    const h = this._uvH[idx]!
    for (let i = 0; i < 4; i++) {
      this._instanceUVBuffer[i * 4 + 0] = x
      this._instanceUVBuffer[i * 4 + 1] = y
      this._instanceUVBuffer[i * 4 + 2] = w
      this._instanceUVBuffer[i * 4 + 3] = h
    }
    const uvAttr = this.geometry.getAttribute('instanceUV') as BufferAttribute
    if (uvAttr) {
      uvAttr.needsUpdate = true
    }
  }

  /**
   * Update the instanceColor attribute from current tint and alpha.
   * Writes to own geometry buffer only (standalone mode).
   */
  private _updateOwnColor() {
    const idx = this._idx
    const r = this._colorR[idx]!
    const g = this._colorG[idx]!
    const b = this._colorB[idx]!
    const a = this._colorA[idx]!
    for (let i = 0; i < 4; i++) {
      this._instanceColorBuffer[i * 4 + 0] = r
      this._instanceColorBuffer[i * 4 + 1] = g
      this._instanceColorBuffer[i * 4 + 2] = b
      this._instanceColorBuffer[i * 4 + 3] = a
    }
    const colorAttr = this.geometry.getAttribute('instanceColor') as BufferAttribute
    if (colorAttr) {
      colorAttr.needsUpdate = true
    }
  }

  /**
   * Get world position (convenience method).
   */
  getWorldPosition2D(): Vector2 {
    const worldPos = new Vector3()
    super.getWorldPosition(worldPos)
    return new Vector2(worldPos.x, worldPos.y)
  }

  // ============================================
  // INSTANCE-BASED EFFECT SYSTEM
  // ============================================


  /**
   * Add an effect instance to this sprite.
   * Auto-registers the effect type on the material if not already registered.
   * Sets the enable bit and writes effect data to packed buffers.
   *
   * @example
   * ```typescript
   * const dissolve = new DissolveEffect()
   * dissolve.progress = 0.5
   * sprite.addEffect(dissolve)
   * ```
   */
  addEffect(effect: MaterialEffect): this {
    // Same instance already attached — no-op (R3F stable children)
    if (this._effects.includes(effect)) return this

    const EffectClass = effect.constructor as typeof MaterialEffect
    const hasConstants = Object.keys(EffectClass._constantFactories).length > 0

    // Provider effects with constants may need a different material
    if (hasConstants) {
      // Link and store the effect first (needed for _switchToMaterial)
      effect._attach(this)
      this._effects.push(effect)

      // Build effects key for all effects with constants
      const effectsKey = this._effects
        .filter(e => Object.keys((e.constructor as typeof MaterialEffect)._constantFactories).length > 0)
        .map(e => {
          const EC = e.constructor as typeof MaterialEffect
          return `${EC.effectName}:${this._constantsKey(e._constants)}`
        })
        .join(';')

      const newMaterial = Sprite2DMaterial.getShared({
        map: this._texture ?? undefined,
        transparent: this.material.transparent,
        colorTransform: this.material.colorTransform ?? undefined,
        effectsKey,
      })

      if (newMaterial !== this.material) {
        this._switchToMaterial(newMaterial)
      } else {
        // Same material — just register the effect
        if (!this.material.hasEffect(EffectClass)) {
          const tierChanged = this.material.registerEffect(EffectClass, effect._constants)
          if (tierChanged) {
            this._setupInstanceAttributes()
          }
        }
      }

      // Set enable bit (lives in effectBuf0.y, indexed from bit 0)
      const bitIndex = this.material._effectBitIndex.get(EffectClass.effectName)!
      this._effectEnableBits |= (1 << bitIndex)

      // Add trait to entity (if enrolled)
      if (this._entity) {
        const traitData = this._buildTraitData(effect)
        this._entity.add(EffectClass._trait(traitData))
        this._entity.set(EffectClass._trait, traitData)
      }

      if (!this._entity) {
        this._writeEffectDataOwn()
      }

      return this
    }

    // Standard (non-provider) effect flow
    const material = this.material

    // 1. Auto-register on material if not already registered
    if (!material.hasEffect(EffectClass)) {
      const tierChanged = material.registerEffect(EffectClass)
      if (tierChanged) {
        // Tier changed — recreate own geometry buffers for new attributes
        this._setupInstanceAttributes()
      }
    }

    // 2. Link effect to this sprite's entity
    effect._attach(this)

    // 3. Set enable bit (effectBuf0.y)
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectEnableBits |= (1 << bitIndex)

    // 4. Add trait to entity (if enrolled)
    if (this._entity) {
      const traitData = this._buildTraitData(effect)
      // Koota's .add() does NOT trigger Changed(), but bufferSyncEffectSystem
      // only queries Changed(effectTrait). Follow .add() with .set() so that
      // already-batched sprites get their effect data synced to GPU buffers.
      this._entity.add(EffectClass._trait(traitData))
      this._entity.set(EffectClass._trait, traitData)
    }

    // 5. Store effect
    this._effects.push(effect)

    // 6. Write packed data to own geometry buffers (standalone mode only).
    //    For batched sprites, batchAssignSystem/bufferSyncEffectSystem handles sync.
    if (!this._entity) {
      this._writeEffectDataOwn()
    }

    return this
  }

  /**
   * Remove an effect instance from this sprite.
   * Clears the enable bit and resets effect data to defaults.
   * The effect type remains registered on the material (no shader change).
   */
  removeEffect(effect: MaterialEffect): this {
    const material = this.material
    const EffectClass = effect.constructor as typeof MaterialEffect

    if (!material.hasEffect(EffectClass)) return this

    const effectIndex = this._effects.indexOf(effect)
    if (effectIndex === -1) return this

    // 1. Clear enable bit (effectBuf0.y)
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectEnableBits &= ~(1 << bitIndex)

    // 2. Remove trait from entity (if enrolled)
    if (this._entity && this._entity.has(EffectClass._trait)) {
      this._entity.remove(EffectClass._trait)
    }

    // 3. Detach effect and remove from list
    effect._detach()
    this._effects.splice(effectIndex, 1)

    // 4. Write updated packed data to own geometry buffers (standalone only).
    //    For batched sprites, bufferSyncEffectSystem handles sync.
    if (!this._entity) {
      this._writeEffectDataOwn()
    }

    return this
  }

  /**
   * Build trait initialization data from an effect's current snapshot defaults.
   * @internal
   */
  private _buildTraitData(effect: MaterialEffect): Record<string, number> {
    const ctor = effect.constructor as typeof MaterialEffect
    const data: Record<string, number> = {}
    for (const field of ctor._fields) {
      const value = effect._defaults[field.name]
      if (field.size === 1) {
        data[field.name] = value as number
      } else {
        const arr = value as number[]
        for (let i = 0; i < field.size; i++) {
          data[`${field.name}_${i}`] = arr[i]!
        }
      }
    }
    return data
  }

  /**
   * Write all packed effect data to own geometry buffers (standalone mode).
   * @internal
   */
  _writeEffectDataOwn(): void {
    const material = this.material
    const tier = material._effectTier
    if (tier === 0) return

    // Slot 0 (effectBuf0.x) = system flags; slot 1 (effectBuf0.y) = enable bits.
    this._writePackedSlotOwn(0, this._effectFlags)
    this._writePackedSlotOwn(1, this._effectEnableBits)

    // Write effect field values to their packed positions
    for (const effect of this._effects) {
      const EffectClass = effect.constructor as typeof MaterialEffect
      for (const field of EffectClass._fields) {
        const slotKey = `${EffectClass.effectName}_${field.name}`
        const slotInfo = material._effectSlots.get(slotKey)
        if (!slotInfo) continue

        const value = effect._getField(field.name)
        if (typeof value === 'number') {
          this._writePackedSlotOwn(slotInfo.offset, value)
        } else {
          for (let i = 0; i < value.length; i++) {
            this._writePackedSlotOwn(slotInfo.offset + i, value[i]!)
          }
        }
      }
    }

    // Zero out slots for effects registered on material but not active on this sprite
    for (const effectClass of material._effects) {
      const isActive = this._effects.some(e => (e.constructor as typeof MaterialEffect).effectName === effectClass.effectName)
      if (!isActive) {
        for (const field of effectClass._fields) {
          const slotKey = `${effectClass.effectName}_${field.name}`
          const slotInfo = material._effectSlots.get(slotKey)
          if (!slotInfo) continue
          for (let i = 0; i < field.size; i++) {
            this._writePackedSlotOwn(slotInfo.offset + i, field.default[i]!)
          }
        }
      }
    }
  }


  /**
   * Write a single float to a packed effect buffer slot in own geometry buffer.
   * @internal
   */
  private _writePackedSlotOwn(absoluteOffset: number, value: number): void {
    const bufIndex = Math.floor(absoluteOffset / 4)
    const component = absoluteOffset % 4
    const attrName = `effectBuf${bufIndex}`

    const custom = this._customBuffers.get(attrName)
    if (custom) {
      for (let v = 0; v < 4; v++) {
        custom.buffer[v * 4 + component] = value
      }
      const bufferAttr = this.geometry.getAttribute(attrName) as BufferAttribute
      if (bufferAttr) bufferAttr.needsUpdate = true
    }
  }


  /**
   * Sync both per-sprite flag words to the batch buffer for already-batched
   * sprites. Writes system flags to `effectBuf0.x` and enable bits to
   * `effectBuf0.y`, bypassing ECS change detection.
   * @internal
   */
  _syncEffectFlagsToBatch(): void {
    if (!this._entity || !this._flatlandWorld) return
    const bs = this._entity.get(BatchSlot) as { batchIdx: number; slot: number } | undefined
    if (!bs || bs.batchIdx < 0) return
    const registryEntities = this._flatlandWorld.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return
    const batch = registry.batchSlots[bs.batchIdx]
    if (batch) {
      batch.writeEffectSlot(bs.slot, 0, 0, this._effectFlags)
      batch.writeEffectSlot(bs.slot, 0, 1, this._effectEnableBits)
    }
  }

  /**
   * Fast 2D matrix update — bypasses Three.js quaternion-based compose().
   *
   * Three.js Object3D.updateMatrix() calls matrix.compose(position, quaternion, scale)
   * which does full 3D quaternion→matrix math (~20 multiplies). For 2D sprites we only
   * need position, scale, and optional Z-axis rotation — written directly to the matrix
   * elements.
   *
   * Also bakes in the layer/zIndex Z offset without save/restore of position.z.
   */
  override updateMatrix(): void {
    const te = this.matrix.elements
    const px = this.position.x
    const py = this.position.y
    const pz = this.position.z + this.layer * 10 + this.zIndex * 0.001
    const sx = this.scale.x
    const sy = this.scale.y

    const rz = this.rotation.z
    if (rz !== 0) {
      // 2D rotation around Z axis
      const c = Math.cos(rz)
      const s = Math.sin(rz)
      te[0] = c * sx;  te[4] = -s * sy; te[8]  = 0; te[12] = px
      te[1] = s * sx;  te[5] =  c * sy; te[9]  = 0; te[13] = py
    } else {
      // No rotation — most common path
      te[0] = sx; te[4] = 0;  te[8]  = 0; te[12] = px
      te[1] = 0;  te[5] = sy; te[9]  = 0; te[13] = py
    }
    te[2] = 0; te[6] = 0; te[10] = 1; te[14] = pz
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1

    this.matrixWorldNeedsUpdate = true
  }

  // ============================================
  // ECS ENROLLMENT
  // ============================================

  /**
   * Enroll this sprite in an ECS world.
   * Creates an entity with initial trait values from snapshot.
   * Called automatically by SpriteGroup when adding a sprite.
   *
   * @param world - The ECS world to enroll in (defaults to global world)
   * @internal
   */
  _enrollInWorld(world?: World): void {
    if (this._entity) return // Already enrolled

    const w = world ?? this._flatlandWorld ?? getGlobalWorld()
    this._flatlandWorld = w

    // Read current values from local arrays before swapping refs
    const uvX = this._uvX[0]!, uvY = this._uvY[0]!, uvW = this._uvW[0]!, uvH = this._uvH[0]!
    const cR = this._colorR[0]!, cG = this._colorG[0]!, cB = this._colorB[0]!, cA = this._colorA[0]!
    const fX = this._flipXArr[0]!, fY = this._flipYArr[0]!
    const lay = this._layerArr[0]!
    const zIdx = this._zIndexArr[0]!

    this._entity = w.spawn(
      SpriteUV({ x: uvX, y: uvY, w: uvW, h: uvH }),
      SpriteColor({ r: cR, g: cG, b: cB, a: cA }),
      SpriteFlip({ x: fX, y: fY }),
      SpriteLayer({ layer: lay }),
      SpriteZIndex({ zIndex: zIdx }),
      SpriteMaterialRef({
        materialId: this.material.batchId,
      }),
      IsRenderable,
      IsBatched,
      BatchSlot({ batchIdx: -1, slot: -1 }),
    )

    const eid = (this._entity as unknown as number) & ENTITY_ID_MASK
    this._idx = eid

    // Swap array refs from local to world SoA stores
    const uvStore = resolveStore(w, SpriteUV)
    this._uvX = uvStore['x']!
    this._uvY = uvStore['y']!
    this._uvW = uvStore['w']!
    this._uvH = uvStore['h']!

    const colorStore = resolveStore(w, SpriteColor)
    this._colorR = colorStore['r']!
    this._colorG = colorStore['g']!
    this._colorB = colorStore['b']!
    this._colorA = colorStore['a']!

    const flipStore = resolveStore(w, SpriteFlip)
    this._flipXArr = flipStore['x']!
    this._flipYArr = flipStore['y']!

    this._layerArr = resolveStore(w, SpriteLayer)['layer']!
    this._zIndexArr = resolveStore(w, SpriteZIndex)['zIndex']!

    // Register in the spriteArr for O(1) lookup by entity SoA index.
    const registryEntities = w.query(BatchRegistry)
    if (registryEntities.length > 0) {
      const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
      if (registry) {
        registry.spriteArr[eid] = this
      }
    }

    // Add effect traits for active effects
    for (const effect of this._effects) {
      const EffectClass = effect.constructor as typeof MaterialEffect
      this._entity.add(EffectClass._trait(this._buildTraitData(effect)))
      // Update entity reference on effect instance
      effect._entity = this._entity
    }
  }

  /**
   * Unenroll this sprite from its ECS world.
   * Serializes trait values back to snapshot, then destroys the entity.
   * Called automatically when sprite is removed from SpriteGroup or disposed.
   * @internal
   */
  _unenrollFromWorld(): void {
    if (!this._entity) return

    // Read current values from SoA arrays before swapping refs back
    const eid = this._idx
    const uvX = this._uvX[eid]!, uvY = this._uvY[eid]!, uvW = this._uvW[eid]!, uvH = this._uvH[eid]!
    const cR = this._colorR[eid]!, cG = this._colorG[eid]!, cB = this._colorB[eid]!, cA = this._colorA[eid]!
    const fX = this._flipXArr[eid]!, fY = this._flipYArr[eid]!
    const lay = this._layerArr[eid]!
    const zIdx = this._zIndexArr[eid]!

    // Swap refs back to local arrays and store values
    this._uvX = [uvX]; this._uvY = [uvY]; this._uvW = [uvW]; this._uvH = [uvH]
    this._colorR = [cR]; this._colorG = [cG]; this._colorB = [cB]; this._colorA = [cA]
    this._flipXArr = [fX]; this._flipYArr = [fY]
    this._layerArr = [lay]
    this._zIndexArr = [zIdx]
    this._idx = 0

    // Serialize effect trait values back to effect snapshots
    for (const effect of this._effects) {
      const EffectClass = effect.constructor as typeof MaterialEffect
      if (this._entity.has(EffectClass._trait)) {
        const traitData = this._entity.get(EffectClass._trait) as Record<string, number>
        for (const field of EffectClass._fields) {
          if (field.size === 1) {
            effect._defaults[field.name] = traitData[field.name]!
          } else {
            const arr: number[] = []
            for (let i = 0; i < field.size; i++) {
              arr.push(traitData[`${field.name}_${i}`]!)
            }
            effect._defaults[field.name] = arr
          }
        }
      }
      effect._entity = null
    }

    // Remove from spriteArr
    if (this._flatlandWorld) {
      const registryEntities = this._flatlandWorld.query(BatchRegistry)
      if (registryEntities.length > 0) {
        const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
        if (registry) {
          registry.spriteArr[eid] = null
        }
      }
    }

    // Remove IsRenderable instead of destroying — this triggers Removed(IsRenderable)
    // for batchRemoveSystem, which needs the InBatch relation and BatchSlot data
    // to still be present to find and free the batch slot. The system destroys
    // the entity after cleanup.
    this._entity.remove(IsRenderable)
    this._entity = null
  }

  /**
   * Get the ECS entity for this sprite (null if not enrolled).
   * @internal
   */
  get entity(): Entity | null {
    return this._entity
  }


  /**
   * Dispose of resources.
   */
  dispose() {
    // Unenroll from ECS world
    this._unenrollFromWorld()

    // Detach effects
    for (const effect of this._effects) {
      effect._detach()
    }
    this._effects.length = 0

    // Dispose owned geometry (each sprite has its own)
    if (this._geometry) {
      this._geometry.dispose()
    }
    // Material is NOT disposed here — materials are shared resources.
    // Users/frameworks manage material lifecycle separately.
  }

  /**
   * Clone the sprite.
   */
  override clone(recursive?: boolean): this {
    // Ignore recursive parameter - we create a fresh sprite
    void recursive
    const cloned = new Sprite2D(
      this._texture
        ? {
            texture: this._texture,
            frame: this._frame ?? undefined,
            anchor: this._anchor,
            tint: this.tint,
            alpha: this.alpha,
            flipX: this.flipX,
            flipY: this.flipY,
            layer: this.layer,
            zIndex: this.zIndex,
            pixelPerfect: this.pixelPerfect,
            lit: this.lit,
            receiveShadows: this.receiveShadows,
            castsShadow: this.castsShadow,
            shadowRadius: this._shadowRadius,
          }
        : undefined
    )

    // Clone effect instances
    for (const effect of this._effects) {
      const EffectClass = effect.constructor as { new (): MaterialEffect; _fields: typeof MaterialEffect._fields }
      const clonedEffect = new EffectClass()
      // Copy snapshot defaults
      for (const field of EffectClass._fields) {
        const value = effect._defaults[field.name]
        if (typeof value === 'number') {
          clonedEffect._defaults[field.name] = value
        } else {
          clonedEffect._defaults[field.name] = [...(value as number[])]
        }
      }
      cloned.addEffect(clonedEffect)
    }

    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    return cloned as this
  }
}
