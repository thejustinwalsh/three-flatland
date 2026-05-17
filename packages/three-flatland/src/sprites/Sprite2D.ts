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
   * Shared material cache keyed by texture. Sprites created with just a texture
   * (no explicit material) reuse the same Sprite2DMaterial, which means they share
   * the same batchId and are automatically batched together by SpriteGroup.
   */
  private static _sharedMaterials = new WeakMap<Texture, Sprite2DMaterial>()

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

  // ============================================
  // EFFECT STATE
  // ============================================

  /**
   * Enable flags bitmask for packed effects.
   * Bit N = 1 means effect at index N is enabled for this sprite.
   * @internal
   */
  _effectFlags: number = 0

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

  /**
   * Cached batch references for O(1) direct-write dispatch from setters.
   *
   * Populated by `batchAssignSystem` once a slot is allocated; updated by
   * `batchReassignSystem` on cross-batch moves; cleared by
   * `batchRemoveSystem` on slot free. While `_entity !== null`,
   * `_batchMesh !== null` and `_batchSlot >= 0` is the invariant.
   *
   * Setters that need to write to GPU buffers (UV via setFrame, color
   * via tint/alpha, flip via flipX/flipY) read these directly instead
   * of routing through Koota's Changed channel and a per-frame
   * bufferSync system pass.
   * @internal
   */
  _batchMesh: import('../pipeline/SpriteBatch').SpriteBatch | null = null
  /** @internal */ _batchSlot: number = -1
  /** @internal */ _batchIdx: number = -1

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
  // instanceSystem: 4 vertices x vec4 = 16 floats
  //   .x = flipX, .y = flipY, .z = sysFlags, .w = enableBits
  // Matches the batched interleaved layout so the shader can read
  // flip + system flags + effect enable bits from the same attribute
  // regardless of standalone vs batched.
  private _instanceSystemBuffer: Float32Array = new Float32Array([
    1, 1, 0, 0, // vertex 0
    1, 1, 0, 0, // vertex 1
    1, 1, 0, 0, // vertex 2
    1, 1, 0, 0, // vertex 3
  ])
  // instanceExtras: 4 vertices x vec4 = 16 floats. All zeros — reserved
  // for lighting (shadowRadius). Sprite-sort PR doesn't write to it.
  private _instanceExtrasBuffer: Float32Array = new Float32Array(16)

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
      let shared = Sprite2D._sharedMaterials.get(options.texture)
      if (!shared) {
        shared = new Sprite2DMaterial({ map: options.texture, transparent: true })
        Sprite2D._sharedMaterials.set(options.texture, shared)
      }
      material = shared
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
      // Three states:
      //   batched (_batchMesh set) → direct mesh write
      //   enrolled but not yet batched (_entity set, _batchMesh null) →
      //     no-op; SoA write above is enough, batchAssignSystem will sync
      //     to the mesh when the slot is allocated
      //   standalone (no _entity) → own geometry buffer
      if (this._batchMesh) {
        this._batchMesh.writeColor(this._batchSlot, this._tintColor.r, this._tintColor.g, this._tintColor.b, this._colorA[i]!)
      } else if (!this._entity) {
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

    this._updateOwnFlip()
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
    // Raw array writes to the SoA store (no Koota Changed roundtrip).
    const i = this._idx
    this._uvX[i] = frame.x
    this._uvY[i] = frame.y
    this._uvW[i] = frame.width
    this._uvH[i] = frame.height
    // Direct-write to the batch buffer when batched — transformSyncSystem
    // no longer rewrites UV every frame (only AnimatedSprite2D and explicit
    // setFrame calls change it, and they all route through here). Enrolled-
    // but-not-yet-batched falls through with no own-buffer write — the SoA
    // write above is what batchAssignSystem reads when it syncs the slot.
    if (this._batchMesh) {
      this._batchMesh.writeUV(this._batchSlot, frame.x, frame.y, frame.width, frame.height)
    } else if (!this._entity) {
      this._updateOwnUV()
    }
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
    const i = this._idx
    this._colorA[i] = value
    if (this._batchMesh) {
      this._batchMesh.writeColor(this._batchSlot, this._colorR[i]!, this._colorG[i]!, this._colorB[i]!, value)
    } else if (!this._entity) {
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
    const i = this._idx
    const numVal = value ? -1 : 1
    if (this._flipXArr[i]! === numVal) return
    this._flipXArr[i] = numVal
    if (this._batchMesh) {
      this._batchMesh.writeFlip(this._batchSlot, numVal, this._flipYArr[i]!)
    } else if (!this._entity) {
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
    const i = this._idx
    const numVal = value ? -1 : 1
    if (this._flipYArr[i]! === numVal) return
    this._flipYArr[i] = numVal
    if (this._batchMesh) {
      this._batchMesh.writeFlip(this._batchSlot, this._flipXArr[i]!, numVal)
    } else if (!this._entity) {
      this._updateOwnFlip()
    }
  }

  /**
   * Flip the sprite.
   */
  flip(horizontal: boolean, vertical: boolean): this {
    const i = this._idx
    const fx = horizontal ? -1 : 1
    const fy = vertical ? -1 : 1
    this._flipXArr[i] = fx
    this._flipYArr[i] = fy
    if (this._batchMesh) {
      this._batchMesh.writeFlip(this._batchSlot, fx, fy)
    } else if (!this._entity) {
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
   *
   * Hot path. Every moving sprite in a y-sorted scene calls this every
   * frame, so the cost has to stay near-zero per call.
   *
   * The raw SoA write is unconditional — `transformSyncSystem` reads
   * `_zIndexArr` directly and bakes the value into the instance matrix
   * for the GPU depth test. That alone is enough for alphaTest+depthWrite
   * materials (GPU resolves order via the baked-in Z, no CPU sort needed).
   *
   * For non-gated materials, we flip the batch's `_sortDirty` flag so
   * `batchSortSystem` knows to re-sort this batch on its next pass. This
   * replaced the prior `Changed(SpriteZIndex)` channel — Koota's change
   * tracker enumerated every flip every frame even when the gate trivially
   * skipped the sort, costing ~7ms/frame in a 12k-sprite demo. The
   * per-batch boolean costs one ref read + one write.
   */
  set zIndex(value: number) {
    const prev = this._zIndexArr[this._idx]!
    if (prev === value) return
    this._zIndexArr[this._idx] = value
    if (this._batchMesh) {
      const mat = this.material
      if (mat.alphaTest > 0 && mat.depthWrite) return
      this._batchMesh.markSortDirty()
    }
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
   * Writes to instanceSystem.xy — the same slot the batched path uses.
   */
  private _updateOwnFlip() {
    const idx = this._idx
    const fx = this._flipXArr[idx]!
    const fy = this._flipYArr[idx]!
    for (let i = 0; i < 4; i++) {
      this._instanceSystemBuffer[i * 4 + 0] = fx
      this._instanceSystemBuffer[i * 4 + 1] = fy
    }
    const systemAttr = this.geometry.getAttribute('instanceSystem') as BufferAttribute
    if (systemAttr) {
      systemAttr.needsUpdate = true
    }
  }

  /**
   * Update the effect enable-bits slot (instanceSystem.w) in own
   * geometry buffer (standalone mode). Mirrors SpriteBatch.writeEnableBits
   * for the batched path.
   */
  private _updateOwnEnableBits() {
    for (let i = 0; i < 4; i++) {
      this._instanceSystemBuffer[i * 4 + 3] = this._effectFlags
    }
    const systemAttr = this.geometry.getAttribute('instanceSystem') as BufferAttribute
    if (systemAttr) {
      systemAttr.needsUpdate = true
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

    // Core instance attributes (persistent buffers). instanceSystem and
    // instanceExtras carry the same logical slots the batched path packs
    // into its InstancedInterleavedBuffer (flip + sysFlags + enableBits
    // for system; shadowRadius + reserved for extras).
    geo.setAttribute('instanceUV', new BufferAttribute(this._instanceUVBuffer, 4))
    geo.setAttribute('instanceColor', new BufferAttribute(this._instanceColorBuffer, 4))
    geo.setAttribute('instanceSystem', new BufferAttribute(this._instanceSystemBuffer, 4))
    geo.setAttribute('instanceExtras', new BufferAttribute(this._instanceExtrasBuffer, 4))

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

    const material = this.material
    const EffectClass = effect.constructor as typeof MaterialEffect

    // 1. Auto-register on material if not already registered
    if (!material.hasEffect(EffectClass)) {
      console.warn(
        `Sprite2D.addEffect: effect "${EffectClass.effectName}" was not pre-registered on the material — ` +
        `auto-registering now triggers a shader recompile and can cause a runtime stall. ` +
        `Call material.registerEffect(${EffectClass.name || 'EffectClass'}) ahead of time (e.g., right after material creation) to avoid this.`,
      )
      const tierChanged = material.registerEffect(EffectClass)
      if (tierChanged) {
        // Tier changed — recreate own geometry buffers for new attributes
        this._setupInstanceAttributes()
      }
    }

    // 2. Link effect to this sprite's entity
    effect._attach(this)

    // 3. Set enable bit in flags bitmask
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectFlags |= (1 << bitIndex)

    // 4. Add trait to entity (if enrolled) — ECS state only. No .set()
    //    follow-up needed; the direct-write below pushes the data to the
    //    GPU buffer immediately, no Changed event consumer.
    if (this._entity) {
      const traitData = this._buildTraitData(effect)
      this._entity.add(EffectClass._trait(traitData))
    }

    // 5. Store effect
    this._effects.push(effect)

    // 6. Write packed data directly to wherever this sprite lives.
    if (this._batchMesh) {
      this._writeEffectStateToBatch()
    } else if (!this._entity) {
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

    // 1. Clear enable bit in flags bitmask
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectFlags &= ~(1 << bitIndex)

    // 2. Remove trait from entity (if enrolled) — ECS state only.
    if (this._entity && this._entity.has(EffectClass._trait)) {
      this._entity.remove(EffectClass._trait)
    }

    // 3. Detach effect and remove from list
    effect._detach()
    this._effects.splice(effectIndex, 1)

    // 4. Write updated packed data directly to wherever this sprite lives.
    //    Effect data slots become don't-care (bit-off, shader ignores), so
    //    only the flags float actually needs to change — but we write the
    //    full state for symmetry with addEffect.
    if (this._batchMesh) {
      this._writeEffectStateToBatch()
    } else if (!this._entity) {
      this._writeEffectDataOwn()
    }

    return this
  }

  /**
   * Direct-write the sprite's current effect state (flags + active field
   * values) into its batch's packed effect buffers. Same pattern as the
   * color / zIndex setters — uses the cached `_batchMesh` + `_batchSlot`
   * refs instead of routing through Koota Changed events.
   * @internal
   */
  private _writeEffectStateToBatch(): void {
    const mesh = this._batchMesh
    if (!mesh) return
    const material = this.material
    if (material._effectTier === 0) return

    const slot = this._batchSlot
    // Enable bits live in the interleaved core (instanceSystem.w), NOT
    // in effectBuf0 — see SpriteBatch.writeEnableBits and the
    // EffectMaterial shader composition (reads `instanceSystem.w`).
    mesh.writeEnableBits(slot, this._effectFlags)

    for (const effect of this._effects) {
      const EffectClass = effect.constructor as typeof MaterialEffect
      for (const field of EffectClass._fields) {
        const slotKey = `${EffectClass.effectName}_${field.name}`
        const slotInfo = material._effectSlots.get(slotKey)
        if (!slotInfo) continue

        const value = effect._getField(field.name)
        if (typeof value === 'number') {
          const off = slotInfo.offset
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, value)
        } else {
          for (let i = 0; i < value.length; i++) {
            const off = slotInfo.offset + i
            mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, value[i]!)
          }
        }
      }
    }
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

    // Enable bits live in instanceSystem.w (same as the batched path's
    // writeEnableBits). Effect buffers are now pure effect data starting
    // at offset 0 — no flags slot.
    this._updateOwnEnableBits()

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
