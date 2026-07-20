import {
  Mesh,
  Vector2,
  Vector3,
  Color,
  BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  type BufferGeometry,
  type Scene,
  type Texture,
  type Raycaster,
  type Intersection,
} from 'three'
import type { Entity, World } from 'koota'
import type { MaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial, type Sprite2DMaterialOptions } from '../materials/Sprite2DMaterial'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import type { Sprite2DOptions, SpriteFrame } from './types'
import {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SortLayer,
  CameraLayersMask,
  SpriteZIndex,
  SpriteMaterialRef,
  IsRenderable,
  IsBatched,
  BatchSlot,
  BatchRegistry,
} from '../ecs/traits'
import { resolveSortLayer, type SortLayerName, type SortLayerValue } from '../pipeline/sortLayers'
import { getWorldDefaultMaterial, getWorldEffectVariant, type RegistryData } from '../ecs/batchUtils'
import { ENTITY_ID_MASK, resolveStore } from '../ecs/snapshot'
import { getGlobalWorld } from '../ecs/world'
import { observable } from '../observable'
import type { HitTestMode } from '../events/HitTestMode'
import { resolveHitTestMode } from '../events/HitTestMode'
import type { AlphaMap } from '../events/AlphaMap'
import { rayPlaneZ0, createIntersection } from '../events/raycastHelpers'
import { createSynthQuadGeometry } from '../pipeline/synthQuadGeometry'
import { flatlandPrime, flatlandRegister, flatlandUnregister } from '../orchestration/orchestrator'
import type { Registry } from '../orchestration/registry'

// Types the build-time `process.env` read without requiring @types/node
// (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string } }

/**
 * System flag layout for `_systemFlags` now lives in a neutral module
 * so `EffectMaterial` can consume the same constants without creating a
 * Sprite2D → Sprite2DMaterial → EffectMaterial → Sprite2D cycle.
 * Re-exported here so existing `import { LIT_FLAG_MASK } from '.../Sprite2D'`
 * call sites keep working.
 */
export {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
  ROTATED_FRAME_MASK,
  EFFECT_BIT_OFFSET,
} from '../materials/effectFlagBits'
import { LIT_FLAG_MASK, RECEIVE_SHADOWS_MASK, CAST_SHADOW_MASK, ROTATED_FRAME_MASK } from '../materials/effectFlagBits'

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
 * sprite.sortLayer = SortLayers.ENTITIES; // or the typed name: 'entities'
 * sprite.zIndex = sprite.position.y; // Y-sort
 * scene.add(sprite);
 * ```
 */
/** One-shot latch: warn once per sprite when 'alpha' mode lacks an
 * alphaMap, so a scene of thousands of misconfigured sprites doesn't
 * flood the console on every raycast. Keyed by sprite (not a single
 * process-wide flag) so one misconfigured sprite's warning doesn't
 * suppress the same warning for every other sprite. Spec §7.1. */
const _warnedMissingAlphaMap = new WeakSet<object>()

export class Sprite2D extends Mesh {
  declare geometry: BufferGeometry
  declare material: Sprite2DMaterial

  /**
   * Backing field for the `material` prototype accessor installed after
   * this class (see the `Object.defineProperty` call at the bottom of
   * this file — `Mesh` declares `material` as a plain data property, and
   * TypeScript disallows shadowing that with a class accessor (TS2611),
   * same reasoning as the `renderOrder` interception below).
   *
   * Declared with `declare` (ambient — no runtime class-field emission)
   * rather than as a real field. With `target: ES2022`,
   * `useDefineForClassFields` is on, so an uninitialized real field here
   * would be `[[Define]]`'d back to `undefined` immediately after
   * `super()` returns — wiping out the value the `material` setter just
   * wrote during `Mesh`'s constructor (`super(geometry, material)` calls
   * `this.material = material`, which runs before any of Sprite2D's own
   * field initializers). `_setupInstanceAttributes()`, called later in
   * this same constructor, needs the real material immediately, so it
   * can't tolerate that wipe the way `_renderOrderValue` does (that one
   * is gated by `_interceptionArmed` until construction finishes).
   * @internal
   */
  declare _materialRef: Sprite2DMaterial

  /**
   * Internal-only material write that preserves bootstrap/registry-default
   * bookkeeping — used by the `texture` setter's same-status default swap
   * (new texture, still an auto-managed default). Going through the
   * public `material` setter there would look identical to a user's
   * explicit override and would wrongly opt the sprite out of
   * auto-orchestration management.
   * @internal
   */
  private _setMaterialInternal(value: Sprite2DMaterial): void {
    this._materialRef = value
  }

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

  // ============================================
  // HIT-TESTING STATE
  // ============================================

  /** Hit-test modes supported by this class. See spec §6. */
  static readonly supportedHitTestModes: readonly HitTestMode[] = ['radius', 'bounds', 'alpha', 'none']

  /** CPU-side alpha data for `'alpha'` hit-test mode. */
  alphaMap: AlphaMap | null = null

  /** Alpha value (0–1) below which a pixel is treated as transparent. */
  alphaThreshold: number = 0.5

  /** Custom hit radius in local units (default 0.5 = inscribed circle of unit quad). */
  private _hitRadius: number = 0.5

  /** Active hit-test strategy. */
  private _hitTestMode: HitTestMode = 'radius'

  /** Hit radius override in local units. Default 0.5 (inscribed half-width of unit quad). */
  get hitRadius(): number {
    return this._hitRadius
  }

  set hitRadius(value: number) {
    this._hitRadius = value
  }

  /** Pointer hit-testing strategy. Setting `'none'` nulls the instance `raycast` property. */
  get hitTestMode(): HitTestMode {
    return this._hitTestMode
  }

  set hitTestMode(value: HitTestMode) {
    const resolved = resolveHitTestMode(value, Sprite2D.supportedHitTestModes, 'Sprite2D')
    this._hitTestMode = resolved
    if (resolved === 'none') {
      // Null the own-property so R3F / three skips this object in raycast traversal
      ;(this as { raycast: unknown }).raycast = null
    } else {
      // Delete the own-property to restore the prototype method
      delete (this as { raycast?: unknown }).raycast
    }
  }

  /** Pixel-perfect mode */
  pixelPerfect: boolean = false

  /**
   * Whether this sprite receives lighting from Flatland's LightEffect.
   * Stored as bit 0 of `_systemFlags` so lit/unlit sprites with the same
   * texture share the same material and batch together.
   * Default: `true` — set `lit = false` to opt out.
   */
  get lit(): boolean {
    return (this._systemFlags & LIT_FLAG_MASK) !== 0
  }

  set lit(value: boolean) {
    const was = (this._systemFlags & LIT_FLAG_MASK) !== 0
    if (was === value) return

    if (value) {
      this._systemFlags |= LIT_FLAG_MASK
    } else {
      this._systemFlags &= ~LIT_FLAG_MASK
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
   * Stored as bit 1 of `_systemFlags`.
   * Default: `true` — set `receiveShadows = false` to opt out.
   */
  get receiveShadows(): boolean {
    return (this._systemFlags & RECEIVE_SHADOWS_MASK) !== 0
  }

  set receiveShadows(value: boolean) {
    const was = (this._systemFlags & RECEIVE_SHADOWS_MASK) !== 0
    if (was === value) return

    if (value) {
      this._systemFlags |= RECEIVE_SHADOWS_MASK
    } else {
      this._systemFlags &= ~RECEIVE_SHADOWS_MASK
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

  /**
   * Per-sprite occluder radius (world units) consumed by shadow-casting
   * LightEffects — e.g. {@link DefaultLightEffect}'s SDF sphere-tracer
   * uses it as the self-silhouette escape distance so a tracer launched
   * from inside the caster steps out cleanly.
   *
   * Returns `undefined` while in auto-resolve mode (default), in which
   * case `transformSyncSystem` writes `max(|scale.x|, |scale.y|)` into
   * the per-instance attribute each frame — covering animation frames
   * and runtime scale changes without manual updates. Assign a number
   * to override (useful when the visible body is tighter than the
   * quad's bounds, or when an off-center anchor pushes the silhouette).
   * Assign `undefined` to return to auto-resolve.
   */
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
   * occlusion pre-pass. Stored as bit 2 of `_systemFlags`. Default: `false`
   * — most sprites don't cast; opt in by setting to `true`.
   *
   * Consumed by the occlusion pre-pass shader, which masks the sprite's
   * alpha by this bit before the SDF seed. Flipping it takes effect on
   * the next frame with zero CPU rebuild (same model as `receiveShadows`).
   */
  get castsShadow(): boolean {
    return (this._systemFlags & CAST_SHADOW_MASK) !== 0
  }

  set castsShadow(value: boolean) {
    const was = (this._systemFlags & CAST_SHADOW_MASK) !== 0
    if (was === value) return

    if (value) {
      this._systemFlags |= CAST_SHADOW_MASK
    } else {
      this._systemFlags &= ~CAST_SHADOW_MASK
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
   * System-flag bitmask written to `instanceSystem.z`.
   *
   * Bits:
   *   0 — lit             (default on)
   *   1 — receiveShadows  (default on)
   *   2 — castsShadow     (default off, opt in)
   *   3..23 — reserved for future system flags
   *
   * MaterialEffect enable bits live in a separate field
   * ({@link _effectFlags}) written to `instanceSystem.w`.
   * @internal
   */
  _systemFlags: number = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK

  /**
   * MaterialEffect enable-bit bitmask written to `instanceSystem.w`.
   *
   * Bit N is set while the Nth registered MaterialEffect on this sprite's
   * material is currently active. 24 slots, bits 0..23. Separate from
   * {@link _systemFlags} so system flags don't compete with user-defined
   * effect capacity.
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

  // SortLayer — needs entity.set() for Changed() on write
  /** @internal */ _layerArr: number[] = [0]

  /**
   * The registered sortLayer name when assigned by name; null when the
   * sprite uses a raw numeric sortLayer. The numeric resolution always
   * lives in `_layerArr` — this only preserves the name for reads.
   * @internal
   */
  _sortLayerName: string | null = null

  /**
   * True once the user explicitly assigned a sortLayer (name or number).
   * SortLayerGroup respects explicit assignments and never overrides them.
   * @internal
   */
  _sortLayerExplicit = false

  /**
   * True once the user directly customized `renderOrder`, escaping the
   * sortLayer system — the sprite renders standalone from then on.
   * @internal
   */
  _renderOrderOverridden = false

  /**
   * Armed at the end of construction; gates the `renderOrder` setter so
   * three's `Object3D` constructor default assignment doesn't count as a
   * user override.
   * @internal
   */
  private _interceptionArmed = false

  /** Backing store for the intercepted `renderOrder` accessor. @internal */
  private _renderOrderValue?: number

  /**
   * The auto-orchestration registry this sprite is tracked by, when it
   * was picked up from a vanilla scene (no SpriteGroup / Flatland).
   * @internal
   */
  _autoRegistry: Registry | null = null

  /**
   * True while the material is the construction-time bootstrap default
   * (texture-only construction, resolved via the static shared cache so
   * an unmanaged standalone sprite still renders). Enrollment re-resolves
   * to a world-scoped default and clears this. Explicit materials and
   * effect-variant switches clear it too.
   * @internal
   */
  _materialIsBootstrapDefault = false

  /**
   * True when the current material came from a world/registry default
   * store. Dispose of such a material resurrects the sprite with a
   * fresh default instead of orphaning it.
   * @internal
   */
  _materialWasRegistryDefault = false

  /**
   * True while the material is a constants-effect variant resolved
   * through the module-global `Sprite2DMaterial.getShared` fallback
   * (an `addEffect` with constants ran before this sprite had a world
   * or auto-orchestration registry to resolve through). Enrollment
   * re-resolves to a world-scoped variant and clears this — the
   * constants-effect counterpart of `_materialIsBootstrapDefault`.
   * @internal
   */
  _materialIsBootstrapVariant = false

  /**
   * True when the current material came from a world/registry
   * effect-variant store. Dispose of such a material resurrects the
   * sprite with a fresh variant instead of orphaning it — the
   * constants-effect counterpart of `_materialWasRegistryDefault`.
   * @internal
   */
  _materialWasRegistryVariant = false

  /**
   * Scene whose prime-pending set still holds this sprite (Signal A
   * fired, no renderer seen yet). Cleared on registration or removal.
   * @internal
   */
  _pendingPrimeScene: Scene | null = null

  /**
   * True while this auto-orchestrated sprite is drawn by a batch — its
   * own Mesh stays hidden (`visible = false`) and setters that would
   * normally reveal the sprite (setFrame, texture) must not flip it
   * back on. Cleared on demotion/unregistration.
   * @internal
   */
  _autoBatched = false

  /**
   * Trimmed-frame placement, baked into the matrix by `updateMatrix`
   * and `transformSyncSystem`: the quad shrinks to the trimmed rect
   * (scale factors) and shifts to its position within the source
   * bounds (offsets, unit-quad space, y-up). Identity for untrimmed
   * frames.
   * @internal
   */
  _trimSX = 1
  /** @internal */ _trimSY = 1
  /** @internal */ _trimOX = 0
  /** @internal */ _trimOY = 0

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
  _batchMesh: SpriteBatch | null = null
  /** @internal */ _batchSlot: number = -1
  /** @internal */ _batchIdx: number = -1

  /** Owned per-sprite geometry (carries the instance-attribute buffers) */
  private _geometry: BufferGeometry | null = null

  /**
   * Instance attribute buffers for single-sprite rendering.
   * The synth quad indexes 4 vertices, so we need 4 copies of each value.
   */
  /**
   * Interleaved per-vertex storage mirroring SpriteBatch's instance
   * layout. 4 vertices × 16 floats per vertex = 64 floats. Each
   * vertex carries the same instance data (no per-vertex variation on
   * standalone sprites). One buffer keeps the standalone draw under the
   * WebGPU vertex-buffer cap even with effectBuf* attributes present
   * (geo + 1 interleaved + effectBuf* vs geo + 4 + effectBuf*).
   *
   * Layout per vertex (offset in floats from vertex base):
   *   0..3   instanceUV      (x, y, w, h)
   *   4..7   instanceColor   (r, g, b, a)
   *   8..11  instanceSystem  (flipX, flipY, sysFlags, enableBits)
   *  12..15  instanceExtras  (shadowRadius, reserved, reserved, reserved)
   */
  private _instanceDataBuffer: Float32Array = (() => {
    const data = new Float32Array(4 * 16)
    for (let v = 0; v < 4; v++) {
      const base = v * 16
      // UV: full texture
      data[base + 0] = 0
      data[base + 1] = 0
      data[base + 2] = 1
      data[base + 3] = 1
      // Color: white, fully opaque
      data[base + 4] = 1
      data[base + 5] = 1
      data[base + 6] = 1
      data[base + 7] = 1
      // System: flipX=1, flipY=1, sysFlags=0, enableBits=0
      data[base + 8] = 1
      data[base + 9] = 1
      data[base + 10] = 0
      data[base + 11] = 0
      // Extras: shadowRadius=0, reserved=0
      data[base + 12] = 0
      data[base + 13] = 0
      data[base + 14] = 0
      data[base + 15] = 0
    }
    return data
  })()

  /**
   * Create a new Sprite2D.
   * Can be called with no arguments for R3F compatibility - set texture via property.
   */
  constructor(options?: Sprite2DOptions) {
    // Resolve material: explicit > shared-by-texture bootstrap > new private.
    // The bootstrap shared material only exists so an unmanaged
    // standalone sprite renders before (or without) enrollment —
    // SpriteGroup/Flatland/auto enrollment re-resolves to a
    // world-scoped default (see _resolveDefaultMaterial).
    let material: Sprite2DMaterial
    let materialIsBootstrap = false
    if (options?.material) {
      material = options.material
    } else if (options?.texture) {
      material = Sprite2DMaterial.getShared({
        map: options.texture,
        transparent: true,
      })
      materialIsBootstrap = true
    } else {
      material = new Sprite2DMaterial({ transparent: true })
      materialIsBootstrap = true
    }

    // Create geometry with instance attributes for single-sprite rendering
    // (Cannot use shared geometry because each sprite needs its own
    // attribute buffers.) Same index/corner layout as the synth quad,
    // plus real position/uv attributes: synth-strategy materials never
    // reference them (so they're never bound), while tight-mesh
    // strategy materials read geometry position/uv — one standalone
    // geometry serves both shader paths.
    const geometry = createSynthQuadGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        // Corner order mirrors synthQuadNodes: v = (u, v) grid
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]),
        3
      )
    )
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2))
    super(geometry, material)

    // Store reference so we can dispose it
    this._geometry = geometry
    this._materialIsBootstrapDefault = materialIsBootstrap

    // Convert stored Color/Vector2 to observable accessors.
    // Position/rotation/scale are NOT observed — accessor overhead on these
    // hot properties (read/written millions of times per frame in game loops)
    // costs more than it saves. transformSyncSystem reads directly from Object3D.
    observable.color.attach(this._tintColor, () => {
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
        this._batchMesh.writeColor(
          this._batchSlot,
          this._tintColor.r,
          this._tintColor.g,
          this._tintColor.b,
          this._colorA[i]!
        )
      } else if (!this._entity) {
        this._updateOwnColor()
      }
    })
    // Anchor mutation triggers a matrix recompose — `updateMatrix`
    // bakes the anchor offset into the translation component, so the
    // GPU sees the new offset on the next frame without any geometry
    // rebuild. The empty callback exists to keep the observer wired
    // (in case future code wants to react), but no work is needed
    // since `updateMatrix` reads the current `_anchor` every frame.
    observable.vector2.attach(this._anchor, () => {
      this.matrixWorldNeedsUpdate = true
    })

    // Set up instance attributes on the geometry
    this._setupInstanceAttributes()

    // Frustum culling friendly name
    this.name = 'Sprite2D'
    this.frustumCulled = true

    // Hide until properly configured (prevents flash on load)
    this.visible = false

    // Wrap three's inherited `Layers` instance so mask mutations
    // (enable/disable/toggle/set or direct `mask =` writes) re-route the
    // sprite to a batch matching the new camera mask. We wrap the
    // instance rather than overriding the property — three's documented
    // `layers` semantics stay intact; we just observe.
    this._wrapLayers()

    // Auto-orchestration Signal A: 'added' fires only on the directly-
    // added node (three gotcha — descendants of an attached subtree get
    // nothing), so this is the opportunistic first-frame-correct path;
    // Signal B in onBeforeRender() is the catch-all fallback.
    this.addEventListener('added', this._onAddedToTree)
    this.addEventListener('removed', this._onRemovedFromTree)

    // If no options, we're being created by R3F - properties will be set via setters
    if (!options) {
      this._interceptionArmed = true
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

    if (options.sortLayer !== undefined) {
      this.sortLayer = options.sortLayer
    }

    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex
    }

    if (options.pixelPerfect !== undefined) {
      this.pixelPerfect = options.pixelPerfect
    }

    if (options.lit === false) {
      this._systemFlags &= ~LIT_FLAG_MASK
    }

    if (options.receiveShadows === false) {
      this._systemFlags &= ~RECEIVE_SHADOWS_MASK
    }

    if (options.castsShadow === true) {
      this._systemFlags |= CAST_SHADOW_MASK
    }

    if (options.shadowRadius !== undefined) {
      this._shadowRadius = options.shadowRadius
    }

    this._updateOwnFlip()
    this._updateOwnShadowRadius()
    this._interceptionArmed = true
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
   * Write the resolved shadow radius into `instanceExtras.x`
   * (interleaved core buffer, float offset 12 within each vertex's
   * stride of 16).
   * @internal
   */
  private _updateOwnShadowRadius() {
    const r = this._resolveShadowRadius()
    for (let v = 0; v < 4; v++) {
      this._instanceDataBuffer[v * 16 + 12] = r
    }
    this._markInstanceDataDirty()
  }

  /**
   * Push the resolved shadow radius to the enrolled SpriteBatch's
   * `instanceExtras.x`. Used when `shadowRadius` is imperatively set
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
    const registry = registryEntities[0]!.get(BatchRegistry) as { batchSlots: readonly unknown[] } | undefined
    if (!registry) return
    const mesh = registry.batchSlots[bs.batchIdx] as { writeShadowRadius(i: number, r: number): void } | undefined
    mesh?.writeShadowRadius(bs.slot, this._resolveShadowRadius())
  }

  /**
   * Resolve a world- or registry-scoped default material for `texture`,
   * for a sprite that isn't holding a user-supplied material.
   *
   * Returns `null` when the sprite has neither an assigned world nor an
   * auto-orchestration registry yet — the pre-enrollment bootstrap
   * fallback (`Sprite2DMaterial.getShared`) covers that case instead.
   * @internal
   */
  private _resolveWorldDefaultMaterial(texture: Texture): Sprite2DMaterial | null {
    if (this._flatlandWorld) {
      const registryEntities = this._flatlandWorld.query(BatchRegistry)
      const registry = registryEntities[0]?.get(BatchRegistry) as RegistryData | undefined
      if (registry) return getWorldDefaultMaterial(this._flatlandWorld, registry, texture)
    }
    if (this._autoRegistry) {
      return this._autoRegistry.getDefaultMaterial(texture)
    }
    return null
  }

  /**
   * Resolve a world- or registry-scoped effect-variant material for
   * `texture` + `options` — the constants-effect counterpart of
   * `_resolveWorldDefaultMaterial`.
   *
   * Returns `null` when the sprite has neither an assigned world nor an
   * auto-orchestration registry yet — the pre-enrollment bootstrap
   * fallback (`Sprite2DMaterial.getShared`) covers that case instead.
   * @internal
   */
  private _resolveWorldEffectVariant(texture: Texture, options: Sprite2DMaterialOptions): Sprite2DMaterial | null {
    if (this._flatlandWorld) {
      const registryEntities = this._flatlandWorld.query(BatchRegistry)
      const registry = registryEntities[0]?.get(BatchRegistry) as RegistryData | undefined
      if (registry) return getWorldEffectVariant(this._flatlandWorld, registry, texture, options)
    }
    if (this._autoRegistry) {
      return this._autoRegistry.getEffectVariant(texture, options)
    }
    return null
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
      if (
        (this._materialIsBootstrapDefault || this._materialWasRegistryDefault) &&
        this.material.getTexture() !== value
      ) {
        // Never mutate a shared bootstrap/world-default material — every
        // other sprite holding the same instance would retexture with
        // it. Re-resolve to the default for the new texture instead.
        const worldDefault = this._resolveWorldDefaultMaterial(value)
        if (worldDefault) {
          this._resolveDefaultMaterial(worldDefault)
        } else {
          // Same-status swap (still bootstrap/registry-default, just for
          // a new texture) — `_setMaterialInternal` bypasses the public
          // setter so it doesn't clear those flags as if this were a
          // user-chosen material.
          this._setMaterialInternal(Sprite2DMaterial.getShared({ map: value, transparent: true }))
          this._setupInstanceAttributes()
        }
      } else if (
        (this._materialIsBootstrapVariant || this._materialWasRegistryVariant) &&
        this.material.getTexture() !== value
      ) {
        // Same reasoning for a shared effect-variant material — re-resolve
        // to the variant for the new texture, carrying the same config
        // (transparent/colorTransform/effectsKey) instead of mutating.
        const options = this._currentVariantOptions()
        const worldVariant = this._resolveWorldEffectVariant(value, options)
        if (worldVariant) {
          this._resolveEffectVariantMaterial(worldVariant)
        } else {
          this._switchToMaterial(Sprite2DMaterial.getShared({ map: value, ...options }))
          this._materialIsBootstrapVariant = true
        }
      } else {
        this.material.setTexture(value)
      }
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
      // Show sprite once texture is set — unless a batch draws it
      if (!this._autoBatched) this.visible = true
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
        parts.push(
          `${key}=${typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : 'ref'}`
        )
      }
    }
    return parts.join(',')
  }

  /**
   * Build the effectsKey for this sprite's currently-attached
   * constants-bearing effects (from `_effects` + `_constantsKey`).
   * Shared by `addEffect` (initial resolution, where the just-added
   * effect is already in `_effects`) and by enrollment/dispose
   * re-resolution, which rebuild the same key from the sprite's live
   * effect state.
   * @internal
   */
  private _buildEffectsKey(): string {
    return this._effects
      .filter((e) => Object.keys((e.constructor as typeof MaterialEffect)._constantFactories).length > 0)
      .map((e) => {
        const EC = e.constructor as typeof MaterialEffect
        return `${EC.effectName}:${this._constantsKey(e._constants)}`
      })
      .join(';')
  }

  /**
   * Options mirroring this sprite's current material config, for
   * re-resolving an effect-variant material (enrollment bootstrap
   * re-resolution, dispose resurrection, or a texture reassignment that
   * must not mutate a shared variant in place).
   * @internal
   */
  _currentVariantOptions(): Sprite2DMaterialOptions {
    return {
      ...this.material.variantOptions,
      effectsKey: this._buildEffectsKey(),
    }
  }

  /**
   * Switch to a different shared material, carrying over all state.
   * @internal
   */
  private _switchToMaterial(newMaterial: Sprite2DMaterial): void {
    const current = this.material
    this.material = newMaterial
    this._materialIsBootstrapDefault = false
    this._materialWasRegistryDefault = false
    this._materialIsBootstrapVariant = false
    this._materialWasRegistryVariant = false

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
   * Swap to a world-scoped default material (enrollment resolution or
   * dispose resurrection). Carries effects/uniforms via the standard
   * switch path, then re-marks the material as a registry default.
   * @internal
   */
  _resolveDefaultMaterial(material: Sprite2DMaterial): void {
    if (this.material === material) {
      this._materialIsBootstrapDefault = false
      this._materialWasRegistryDefault = true
      return
    }
    this._switchToMaterial(material)
    this._materialWasRegistryDefault = true
  }

  /**
   * Swap to a world-scoped effect-variant material (enrollment
   * resolution or dispose resurrection) — the constants-effect
   * counterpart of `_resolveDefaultMaterial`.
   * @internal
   */
  _resolveEffectVariantMaterial(material: Sprite2DMaterial): void {
    if (this.material === material) {
      this._materialIsBootstrapVariant = false
      this._materialWasRegistryVariant = true
      return
    }
    this._switchToMaterial(material)
    this._materialWasRegistryVariant = true
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

    // Rotated-frame flag (TexturePacker 90° CW packing) — the shader
    // unrotates its frame-local sampling per instance.
    const wasRotated = (this._systemFlags & ROTATED_FRAME_MASK) !== 0
    const isRotated = frame.rotated === true
    if (wasRotated !== isRotated) {
      if (isRotated) this._systemFlags |= ROTATED_FRAME_MASK
      else this._systemFlags &= ~ROTATED_FRAME_MASK
      if (this._batchMesh) {
        this._batchMesh.writeSystemFlags(this._batchSlot, this._systemFlags)
      } else if (!this._entity) {
        this._writeEffectDataOwn()
      }
    }

    // Trimmed-frame placement: the packed rect renders at its true
    // position within the source bounds instead of stretching over
    // them. Baked into the matrix (both matrix writers read these).
    if (frame.trimmed && frame.trimOffset) {
      const trim = frame.trimOffset
      this._trimSX = trim.width / frame.sourceWidth
      this._trimSY = trim.height / frame.sourceHeight
      this._trimOX = (trim.x + trim.width / 2) / frame.sourceWidth - 0.5
      this._trimOY = 0.5 - (trim.y + trim.height / 2) / frame.sourceHeight
    } else if (this._trimSX !== 1 || this._trimSY !== 1) {
      this._trimSX = 1
      this._trimSY = 1
      this._trimOX = 0
      this._trimOY = 0
    }
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
    // Show sprite once it has a valid frame — unless a batch draws it
    // (an auto-batched sprite's own mesh must stay hidden).
    if (!this._autoBatched) this.visible = true
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
   *
   * The anchor offset is baked into the matrix transform — no
   * geometry rebuild. Writing `_anchor.set(...)` triggers the
   * observable.vector2 callback which marks the matrix dirty; the next
   * `updateMatrix` picks up the new value.
   */
  setAnchor(x: number, y: number): this {
    this._anchor.set(x, y)
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
   * Get the sortLayer (primary sort key). Returns the registered name
   * when one was assigned; the numeric order otherwise.
   */
  get sortLayer(): SortLayerValue {
    return (this._sortLayerName as SortLayerValue) ?? this._layerArr[this._idx]!
  }

  /**
   * Set the sortLayer (primary sort key) — a registered name (typed via
   * `SortLayerRegistry` augmentation) or a raw numeric order. Routes the
   * sprite to the batch matching its new run key on the next system pass.
   */
  set sortLayer(value: SortLayerValue) {
    const numeric = resolveSortLayer(value)
    this._sortLayerName = typeof value === 'string' ? value : null
    this._sortLayerExplicit = true
    this._layerArr[this._idx] = numeric
    if (this._entity) {
      this._entity.set(SortLayer, { value: numeric })
    } else if (this._autoRegistry) {
      // Standalone auto sprite changed its run key — re-evaluate
      // thresholds on the next sweep (it may now share a run).
      this._autoRegistry._autoEvalDirty = true
    }
  }

  /**
   * The numeric sortLayer order (names resolved). Hot-path accessor for
   * matrix Z-baking and run-key computation.
   * @internal
   */
  get sortLayerValue(): number {
    return this._layerArr[this._idx]!
  }

  /**
   * SortLayerGroup discipline path — identical to the public setter but
   * does NOT mark the assignment explicit, so a later direct
   * `sprite.sortLayer = …` (or a different group) can still take over.
   * @internal
   */
  _applySortLayerFromGroup(name: SortLayerName): void {
    const numeric = resolveSortLayer(name)
    this._sortLayerName = name
    this._layerArr[this._idx] = numeric
    if (this._entity) {
      this._entity.set(SortLayer, { value: numeric })
    } else if (this._autoRegistry) {
      this._autoRegistry._autoEvalDirty = true
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
   * Mark the shared instance-data buffer dirty so three.js re-uploads
   * it on the next render. The four `InterleavedBufferAttribute`
   * views all point at the same underlying `InterleavedBuffer`, so
   * flipping `needsUpdate` on any one of them re-uploads the full
   * per-vertex stride.
   */
  private _markInstanceDataDirty() {
    const attr = this.geometry.getAttribute('instanceUV') as InterleavedBufferAttribute | undefined
    if (attr && (attr.data as { needsUpdate?: boolean })) {
      ;(attr.data as { needsUpdate: boolean }).needsUpdate = true
    }
  }

  /**
   * Update flip flags in own geometry buffer (standalone mode). Flip
   * lives in `instanceSystem.xy` per the interleaved layout.
   */
  private _updateOwnFlip() {
    const idx = this._idx
    const fx = this._flipXArr[idx]!
    const fy = this._flipYArr[idx]!
    for (let v = 0; v < 4; v++) {
      this._instanceDataBuffer[v * 16 + 8] = fx
      this._instanceDataBuffer[v * 16 + 9] = fy
    }
    this._markInstanceDataDirty()
  }

  /**
   * Update the effect enable-bits slot (instanceSystem.w = interleaved
   * offset 11) in own geometry buffer (standalone mode). Mirrors
   * SpriteBatch.writeEnableBits for the batched path.
   */
  private _updateOwnEnableBits() {
    for (let v = 0; v < 4; v++) {
      this._instanceDataBuffer[v * 16 + 11] = this._effectFlags
    }
    this._markInstanceDataDirty()
  }

  /**
   * Set up instance attributes on the geometry for single-sprite rendering.
   * Uses one interleaved buffer (mirroring SpriteBatch) so batched and
   * standalone paths share the same shader attribute shape. Also
   * allocates buffers for custom attributes from the material's schema
   * (pure effect data — `effectBuf0`, `effectBuf1`, ...).
   */
  _setupInstanceAttributes() {
    const geo = this.geometry

    // Core instance data — single interleaved buffer, four attribute
    // views. InterleavedBuffer (not InstancedInterleavedBuffer) because
    // standalone Sprite2D is a regular Mesh, not an InstancedMesh. One
    // buffer keeps standalone-with-effects under the WebGPU vertex-buffer
    // cap (geo + 1 interleaved + effectBuf* vs geo + 4 + effectBuf*).
    const interleaved = new InterleavedBuffer(this._instanceDataBuffer, 16)
    geo.setAttribute('instanceUV', new InterleavedBufferAttribute(interleaved, 4, 0))
    geo.setAttribute('instanceColor', new InterleavedBufferAttribute(interleaved, 4, 4))
    geo.setAttribute('instanceSystem', new InterleavedBufferAttribute(interleaved, 4, 8))
    geo.setAttribute('instanceExtras', new InterleavedBufferAttribute(interleaved, 4, 12))

    // Custom attributes from material schema (pure effect data — no
    // system reservations)
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
    for (let v = 0; v < 4; v++) {
      const base = v * 16
      this._instanceDataBuffer[base + 0] = x
      this._instanceDataBuffer[base + 1] = y
      this._instanceDataBuffer[base + 2] = w
      this._instanceDataBuffer[base + 3] = h
    }
    this._markInstanceDataDirty()
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
    for (let v = 0; v < 4; v++) {
      const base = v * 16 + 4
      this._instanceDataBuffer[base + 0] = r
      this._instanceDataBuffer[base + 1] = g
      this._instanceDataBuffer[base + 2] = b
      this._instanceDataBuffer[base + 3] = a
    }
    this._markInstanceDataDirty()
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
      // Link and store the effect first (needed for _switchToMaterial /
      // _buildEffectsKey, which reads this._effects)
      effect._attach(this)
      this._effects.push(effect)

      const options: Sprite2DMaterialOptions = {
        ...this.material.variantOptions,
        effectsKey: this._buildEffectsKey(),
      }

      // Resolve through the sprite's world/registry when enrolled, so
      // two worlds sharing a texture+effectsKey combination get distinct
      // material instances (effect registration / dispose stay
      // isolated); fall back to the module-global shared cache only
      // pre-enrollment.
      const worldVariant = this._texture ? this._resolveWorldEffectVariant(this._texture, options) : null
      const newMaterial = worldVariant ?? Sprite2DMaterial.getShared({ map: this._texture ?? undefined, ...options })

      if (newMaterial !== this.material) {
        this._switchToMaterial(newMaterial)
        if (worldVariant) {
          this._materialWasRegistryVariant = true
        } else {
          this._materialIsBootstrapVariant = true
        }
      } else {
        // Same material — just register the effect
        if (!this.material.hasEffect(EffectClass)) {
          const tierChanged = this.material.registerEffect(EffectClass, effect._constants)
          if (tierChanged) {
            this._setupInstanceAttributes()
          }
        }
      }

      // Set enable bit (lives in instanceSystem.w, indexed from bit 0)
      const bitIndex = this.material._effectBitIndex.get(EffectClass.effectName)!
      this._effectFlags |= 1 << bitIndex

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
      console.warn(
        `Sprite2D.addEffect: effect "${EffectClass.effectName}" was not pre-registered on the material — ` +
          `auto-registering now triggers a shader recompile and can cause a runtime stall. ` +
          `Call material.registerEffect(${EffectClass.name || 'EffectClass'}) ahead of time (e.g., right after material creation) to avoid this.`
      )
      const tierChanged = material.registerEffect(EffectClass)
      if (tierChanged) {
        // Tier changed — recreate own geometry buffers for new attributes
        this._setupInstanceAttributes()
      }
    }

    // 2. Link effect to this sprite's entity
    effect._attach(this)

    // 3. Set enable bit (instanceSystem.w)
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectFlags |= 1 << bitIndex

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

    // 1. Clear enable bit (instanceSystem.w)
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

    // System flags + enable bits live on `instanceSystem.z/.w` (offsets
    // 10, 11 within each vertex's stride of 16). Write unconditionally
    // — lit non-effect sprites still need their flags.
    for (let v = 0; v < 4; v++) {
      this._instanceDataBuffer[v * 16 + 10] = this._systemFlags
      this._instanceDataBuffer[v * 16 + 11] = this._effectFlags
    }
    this._markInstanceDataDirty()

    const tier = material._effectTier
    if (tier === 0) return

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
      const isActive = this._effects.some(
        (e) => (e.constructor as typeof MaterialEffect).effectName === effectClass.effectName
      )
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
   * Sync both per-sprite flag words to the batch buffer for already-
   * batched sprites. Writes system flags + enable bits into
   * `instanceSystem.z/.w`, bypassing ECS change detection.
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
    const batch = registry.batchSlots[bs.batchIdx] as
      | {
          writeSystemFlags(i: number, v: number): void
          writeEnableBits(i: number, v: number): void
        }
      | undefined
    if (batch) {
      batch.writeSystemFlags(bs.slot, this._systemFlags)
      batch.writeEnableBits(bs.slot, this._effectFlags)
    }
  }

  /**
   * Auto-orchestration Signal A: walk the parent chain to the scene and
   * prime it. Explicitly-managed sprites (SpriteGroup / Flatland) skip
   * inside flatlandPrime via their assigned world.
   * @internal
   */
  _onAddedToTree = (): void => {
    let p = this.parent
    while (p && !(p as Scene).isScene) p = p.parent
    if (p) flatlandPrime(p as Scene, this)
  }

  /**
   * Auto-orchestration cleanup: dropped from the tree → out of the
   * registry (and any still-pending prime set).
   * @internal
   */
  _onRemovedFromTree = (): void => {
    flatlandUnregister(this)
  }

  /**
   * Auto-orchestration Signal B: the sprite's own mesh is being drawn,
   * so the renderer and scene are in hand. One property check per draw
   * once registered — the hot path stays ~free.
   */
  override onBeforeRender: Mesh['onBeforeRender'] = (renderer, scene) => {
    if (this._autoRegistry || this._flatlandWorld) return
    flatlandRegister(this, renderer as unknown as object, scene)
  }

  /**
   * Pointer raycast against the sprite's local Z=0 plane.
   *
   * The quad is a centered unit square ([-0.5, 0.5] in X and Y). Anchor and
   * scale are already baked into the world matrix by `updateMatrix()`, so this
   * method works entirely in centered-quad local space with no anchor math.
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    // `hitTestMode = 'none'` also nulls the instance `raycast` so R3F skips
    // this object at registration (the zero-cost path); this guard is
    // defense-in-depth for direct raycast() calls.
    if (this._hitTestMode === 'none') return
    // Flatland's internal scene disables matrixWorldAutoUpdate — matrices are
    // refreshed once per frame inside render() — so a raycast from user code
    // would otherwise read an identity matrixWorld and test a half-unit disc.
    this.updateMatrixWorld()
    const hit = rayPlaneZ0(raycaster, this)
    if (!hit) return

    const { localX, localY } = hit
    const mode = this._hitTestMode

    if (mode === 'bounds') {
      if (localX < -0.5 || localX > 0.5 || localY < -0.5 || localY > 0.5) return
    } else if (mode === 'alpha') {
      if (localX < -0.5 || localX > 0.5 || localY < -0.5 || localY > 0.5) return
      if (this.alphaMap) {
        let u = localX + 0.5
        let v = localY + 0.5
        // Mirror the renderer's UV flip (Sprite2DMaterial: flipped → 1 - uv)
        // so the alpha sample aligns with the drawn pixels for flipped sprites.
        if (this.flipX) u = 1 - u
        if (this.flipY) v = 1 - v
        // Map sprite-local UV through the frame rect so atlas sub-region
        // sprites sample the right pixels; full-texture sprites have a
        // unit frame, making this equivalent to sampleAtlasUV.
        const sample = this._frame ? this.alphaMap.sampleFrame(u, v, this._frame) : this.alphaMap.sampleAtlasUV(u, v)
        if (sample / 255 < this.alphaThreshold) return
      } else if (!_warnedMissingAlphaMap.has(this) && process.env.NODE_ENV !== 'production') {
        _warnedMissingAlphaMap.add(this)
        console.warn("three-flatland: Sprite2D hitTestMode 'alpha' requires an alphaMap — falling back to 'bounds'")
      }
    } else {
      // radius — inscribed ellipse: (lx/0.5)^2 + (ly/0.5)^2 <= 1
      // Using configurable _hitRadius as the local-space half-extent
      const r = this._hitRadius
      const nx = localX / r
      const ny = localY / r
      if (nx * nx + ny * ny > 1) return
    }

    const u = localX + 0.5
    const v = localY + 0.5
    intersects.push(createIntersection(hit, this, u, v))
  }

  /**
   * Intercepted `renderOrder` write path — three's inherited numeric
   * primitive, installed as a prototype accessor below the class body
   * (TS disallows overriding a data property with an accessor).
   *
   * A batched sprite isn't in three's render list (its batch is), so a
   * direct `renderOrder` write would otherwise be silently ignored.
   * Instead, an explicit user write escapes the sortLayer system: the
   * sprite demotes to standalone and renders with the custom order,
   * exactly as three documents for any Object3D.
   * @internal
   */
  _setRenderOrder(value: number): void {
    const prev = this._renderOrderValue ?? 0
    this._renderOrderValue = value
    if (!this._interceptionArmed || value === prev) return
    // Writing the sortLayer-derived value back is a no-op, per the
    // design contract (`sprite.renderOrder = sortLayer's value`).
    if (value === this.sortLayerValue) return
    this._renderOrderOverridden = true
    if (this._entity) {
      this._demoteToStandalone()
    }
  }

  /**
   * Wrap the inherited `Layers` instance with a Proxy that observes
   * `mask` writes. `enable`/`disable`/`toggle`/`set` all funnel through
   * `this.mask = …` internally, so a single set-trap covers every
   * mutation path. Reads pass straight through.
   * @internal
   */
  private _wrapLayers(): void {
    const target = this.layers
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const sprite = this
    this.layers = new Proxy(target, {
      set(t, prop, value): boolean {
        const isMaskChange = prop === 'mask' && t.mask !== value
        ;(t as unknown as Record<string | symbol, unknown>)[prop] = value
        if (isMaskChange) sprite._onLayersMaskChanged(t.mask)
        return true
      },
    })
  }

  /**
   * Camera-mask mutation hook: mirror the new mask into the ECS so
   * `batchReassignSystem` routes the sprite to a batch with a matching
   * mask. Still batched — a custom mask never drops a sprite to
   * standalone, it just rides in a differently-masked batch.
   * @internal
   */
  _onLayersMaskChanged(mask: number): void {
    if (this._entity) {
      this._entity.set(CameraLayersMask, { mask })
    } else if (this._autoRegistry) {
      // Standalone auto sprite changed its run key — re-evaluate.
      this._autoRegistry._autoEvalDirty = true
    }
  }

  /**
   * Drop out of batching to standalone rendering. Unenrolls from the
   * ECS (freeing the batch slot on the next system pass) and re-parents
   * the sprite under the batching group so its own Mesh draw resumes.
   * @internal
   */
  _demoteToStandalone(): void {
    if (!this._entity || !this._flatlandWorld) return
    const registryEntities = this._flatlandWorld.query(BatchRegistry)
    const registry =
      registryEntities.length > 0 ? (registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined) : undefined
    this._unenrollFromWorld()
    // SpriteGroup-managed sprites were never in the scene tree — parent
    // them under the group so their own Mesh draw resumes. Auto-managed
    // sprites already live in the user's tree; just reveal them.
    if (!this.parent) {
      const parent = registry?.parentGroup
      if (parent && registry.parentAdd && !parent.children.includes(this)) {
        registry.parentAdd.call(parent, this)
      }
    }
    if (this._autoRegistry) {
      this._autoRegistry.standalone.delete(this)
      this._autoRegistry._autoEvalDirty = true
    }
    this._autoBatched = false
    this.visible = true
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
    // Trim bake: the quad covers only the trimmed rect, positioned
    // where it sits inside the source bounds (offsets combine with the
    // anchor term, unrotated — same convention as the anchor bake).
    const sx = this.scale.x * this._trimSX
    const sy = this.scale.y * this._trimSY

    // Anchor offset baked into translation. Anchor (0.5, 0.5) ⇒
    // center ⇒ zero offset. Anchor (0, 1) ⇒ top-left ⇒ shifts the
    // quad +0.5*sx, -0.5*sy. Removes the per-anchor-change geometry
    // rebuild entirely; the unit quad never changes.
    const ax = (0.5 - this._anchor.x + this._trimOX) * this.scale.x
    const ay = (0.5 - this._anchor.y + this._trimOY) * this.scale.y
    const px = this.position.x + ax
    const py = this.position.y + ay
    const pz = this.position.z + this.sortLayerValue * 10 + this.zIndex * 0.001

    const rz = this.rotation.z
    if (rz !== 0) {
      // 2D rotation around Z axis
      const c = Math.cos(rz)
      const s = Math.sin(rz)
      te[0] = c * sx
      te[4] = -s * sy
      te[8] = 0
      te[12] = px
      te[1] = s * sx
      te[5] = c * sy
      te[9] = 0
      te[13] = py
    } else {
      // No rotation — most common path
      te[0] = sx
      te[4] = 0
      te[8] = 0
      te[12] = px
      te[1] = 0
      te[5] = sy
      te[9] = 0
      te[13] = py
    }
    te[2] = 0
    te[6] = 0
    te[10] = 1
    te[14] = pz
    te[3] = 0
    te[7] = 0
    te[11] = 0
    te[15] = 1

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
    const uvX = this._uvX[0]!,
      uvY = this._uvY[0]!,
      uvW = this._uvW[0]!,
      uvH = this._uvH[0]!
    const cR = this._colorR[0]!,
      cG = this._colorG[0]!,
      cB = this._colorB[0]!,
      cA = this._colorA[0]!
    const fX = this._flipXArr[0]!,
      fY = this._flipYArr[0]!
    const lay = this._layerArr[0]!
    const zIdx = this._zIndexArr[0]!

    this._entity = w.spawn(
      SpriteUV({ x: uvX, y: uvY, w: uvW, h: uvH }),
      SpriteColor({ r: cR, g: cG, b: cB, a: cA }),
      SpriteFlip({ x: fX, y: fY }),
      SortLayer({ value: lay }),
      SpriteZIndex({ zIndex: zIdx }),
      CameraLayersMask({ mask: this.layers.mask }),
      SpriteMaterialRef({
        materialId: this.material.batchId,
      }),
      IsRenderable,
      IsBatched,
      BatchSlot({ batchIdx: -1, slot: -1 })
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

    this._layerArr = resolveStore(w, SortLayer)['value']!
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
    const uvX = this._uvX[eid]!,
      uvY = this._uvY[eid]!,
      uvW = this._uvW[eid]!,
      uvH = this._uvH[eid]!
    const cR = this._colorR[eid]!,
      cG = this._colorG[eid]!,
      cB = this._colorB[eid]!,
      cA = this._colorA[eid]!
    const fX = this._flipXArr[eid]!,
      fY = this._flipYArr[eid]!
    const lay = this._layerArr[eid]!
    const zIdx = this._zIndexArr[eid]!

    // Swap refs back to local arrays and store values
    this._uvX = [uvX]
    this._uvY = [uvY]
    this._uvW = [uvW]
    this._uvH = [uvH]
    this._colorR = [cR]
    this._colorG = [cG]
    this._colorB = [cB]
    this._colorA = [cA]
    this._flipXArr = [fX]
    this._flipYArr = [fY]
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

    // Clear cached batch refs immediately. batchRemoveSystem can't do it
    // (the spriteArr entry above is already nulled), and a stale
    // _batchMesh would let direct-write setters (color/alpha/flip/UV)
    // clobber a freed — possibly reallocated — slot before the next
    // system pass.
    this._batchMesh = null
    this._batchSlot = -1
    this._batchIdx = -1
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
            sortLayer: this.sortLayer,
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
      const EffectClass = effect.constructor as {
        new (): MaterialEffect
        _fields: typeof MaterialEffect._fields
      }
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

    // Carry hit-test configuration so a clone stays interactively identical.
    // alphaMap is shared by reference (read-only CPU data). hitTestMode goes
    // through the setter so a cloned 'none' sprite re-nulls its raycast.
    cloned.alphaMap = this.alphaMap
    cloned.alphaThreshold = this.alphaThreshold
    cloned.hitRadius = this._hitRadius
    cloned.hitTestMode = this._hitTestMode

    return cloned as this
  }
}

// Install the `renderOrder` interception as a prototype accessor.
// Object3D declares `renderOrder` as a data property, and TypeScript
// disallows shadowing a data property with a class accessor (ts2611) —
// defineProperty sidesteps that while keeping identical runtime shape.
// Object3D's constructor assignment (`this.renderOrder = 0`) runs through
// this setter pre-arming and is treated as the non-override default.
Object.defineProperty(Sprite2D.prototype, 'renderOrder', {
  get(this: Sprite2D): number {
    return (this as unknown as { _renderOrderValue?: number })._renderOrderValue ?? 0
  },
  set(this: Sprite2D, value: number): void {
    this._setRenderOrder(value)
  },
  configurable: true,
})

// Install the `material` interception as a prototype accessor. `Mesh`
// declares `material` as a plain data property, and TypeScript disallows
// shadowing a data property with a class accessor (ts2611) — same
// reasoning as `renderOrder` above. This runs for every assignment,
// including three's own `Mesh` constructor's `this.material = material`
// via `super(geometry, material)`.
//
// A direct `sprite.material = ...` assignment is the only way user code
// can set the material — there is no other setter — so it's treated as
// an explicit, permanent choice: it clears the bootstrap/registry-default
// bookkeeping (`_materialIsBootstrapDefault` / `_materialWasRegistryDefault`)
// so auto-orchestration's `registerSprite` (orchestration/orchestrator.ts)
// won't silently resolve the sprite back to a shared default material on
// the next scene-add sweep, discarding the caller's material. Internal
// swaps that preserve "still an auto-managed default, just for a
// different texture" status go through `_setMaterialInternal` instead,
// which writes `_materialRef` directly and bypasses this setter.
Object.defineProperty(Sprite2D.prototype, 'material', {
  get(this: Sprite2D): Sprite2DMaterial {
    return this._materialRef
  },
  set(this: Sprite2D, value: Sprite2DMaterial): void {
    this._materialRef = value
    this._materialIsBootstrapDefault = false
    this._materialWasRegistryDefault = false
  },
  configurable: true,
})
