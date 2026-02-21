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
  ThreeRef,
} from '../ecs/traits'
import { readField, readTrait, writeTrait } from '../ecs/snapshot'
import { getGlobalWorld } from '../ecs/world'

/** Pre-enrollment snapshot for Sprite2D visual state. Types match trait schemas. */
interface SpriteSnapshot {
  color: { r: number; g: number; b: number; a: number }
  uv: { x: number; y: number; w: number; h: number }
  flip: { x: number; y: number }
  layer: { layer: number }
  zIndex: { zIndex: number }
}

/** Module-level scratch Color for parsing tint values without allocation. */
const _tempColor = new Color()

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
 * - **Batched** (enrolled in Renderer2D): Setters write to ECS traits only.
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
   * the same batchId and are automatically batched together by Renderer2D.
   */
  private static _sharedMaterials = new WeakMap<Texture, Sprite2DMaterial>()

  /**
   * Own-geometry buffers for custom attributes (unbatched rendering).
   * Each entry maps an attribute name to its Float32Array (4 vertices) and component size.
   * @internal
   */
  private _customBuffers: Map<string, { buffer: Float32Array; size: number }> = new Map()

  /** Anchor point (0-1), affects positioning */
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
  // ECS STATE
  // ============================================

  /**
   * Pre-enrollment snapshot — staging for trait values before entity enrollment.
   * When enrolled, values are read/written via entity traits; snapshot stays
   * allocated but stale (only refreshed on unenrollment).
   * @internal
   */
  _snapshot: SpriteSnapshot = {
    color: { r: 1, g: 1, b: 1, a: 1 },
    uv: { x: 0, y: 0, w: 1, h: 1 },
    flip: { x: 1, y: 1 },
    layer: { layer: 0 },
    zIndex: { zIndex: 0 },
  }

  /**
   * The ECS entity for this sprite (null until enrolled in a world).
   * @internal
   */
  _entity: Entity | null = null

  /**
   * The ECS world this sprite belongs to (set by Renderer2D or Flatland).
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
    // Silent write — UV is synced unconditionally in transformSyncSystem,
    // no Changed(SpriteUV) observer needed.
    writeTrait(this._entity, SpriteUV, this._snapshot.uv, {
      x: frame.x,
      y: frame.y,
      w: frame.width,
      h: frame.height,
    }, false)
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
   * Get the anchor point.
   */
  get anchor(): Vector2 {
    return this._anchor.clone()
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
   * Get tint color.
   */
  get tint(): Color {
    const c = readTrait(this._entity, SpriteColor, this._snapshot.color)
    return new Color(c.r, c.g, c.b)
  }

  /**
   * Set tint color. Accepts Color, hex string, hex number, or [r, g, b] array (0-1).
   */
  set tint(value: Color | string | number | [number, number, number]) {
    if (Array.isArray(value)) {
      _tempColor.setRGB(value[0], value[1], value[2])
    } else if (value instanceof Color) {
      _tempColor.copy(value)
    } else {
      _tempColor.set(value)
    }
    writeTrait(this._entity, SpriteColor, this._snapshot.color, {
      r: _tempColor.r,
      g: _tempColor.g,
      b: _tempColor.b,
    })
    if (!this._entity) this._updateOwnColor()
  }

  /**
   * Get alpha/opacity.
   */
  get alpha(): number {
    return readField(this._entity, SpriteColor, 'a', this._snapshot.color.a)
  }

  /**
   * Set alpha/opacity (0-1).
   */
  set alpha(value: number) {
    writeTrait(this._entity, SpriteColor, this._snapshot.color, { a: value })
    if (!this._entity) this._updateOwnColor()
  }

  /**
   * Get flipX state.
   */
  get flipX(): boolean {
    return readField(this._entity, SpriteFlip, 'x', this._snapshot.flip.x) === -1
  }

  /**
   * Set flipX state.
   */
  set flipX(value: boolean) {
    const numVal = value ? -1 : 1
    if (readField(this._entity, SpriteFlip, 'x', this._snapshot.flip.x) === numVal) return
    writeTrait(this._entity, SpriteFlip, this._snapshot.flip, { x: numVal })
    if (!this._entity) this._updateOwnFlip()
  }

  /**
   * Get flipY state.
   */
  get flipY(): boolean {
    return readField(this._entity, SpriteFlip, 'y', this._snapshot.flip.y) === -1
  }

  /**
   * Set flipY state.
   */
  set flipY(value: boolean) {
    const numVal = value ? -1 : 1
    if (readField(this._entity, SpriteFlip, 'y', this._snapshot.flip.y) === numVal) return
    writeTrait(this._entity, SpriteFlip, this._snapshot.flip, { y: numVal })
    if (!this._entity) this._updateOwnFlip()
  }

  /**
   * Flip the sprite.
   */
  flip(horizontal: boolean, vertical: boolean): this {
    writeTrait(this._entity, SpriteFlip, this._snapshot.flip, {
      x: horizontal ? -1 : 1,
      y: vertical ? -1 : 1,
    })
    if (!this._entity) this._updateOwnFlip()
    return this
  }

  /**
   * Get render layer (primary sort key).
   */
  get layer(): number {
    return readField(this._entity, SpriteLayer, 'layer', this._snapshot.layer.layer)
  }

  /**
   * Set render layer (primary sort key).
   */
  set layer(value: number) {
    writeTrait(this._entity, SpriteLayer, this._snapshot.layer, { layer: value })
  }

  /**
   * Get z-index within layer (secondary sort key).
   */
  get zIndex(): number {
    return readField(this._entity, SpriteZIndex, 'zIndex', this._snapshot.zIndex.zIndex)
  }

  /**
   * Set z-index within layer (secondary sort key).
   */
  set zIndex(value: number) {
    writeTrait(this._entity, SpriteZIndex, this._snapshot.zIndex, { zIndex: value }, false)
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
    const f = readTrait(this._entity, SpriteFlip, this._snapshot.flip)
    for (let i = 0; i < 4; i++) {
      this._instanceFlipBuffer[i * 2 + 0] = f.x
      this._instanceFlipBuffer[i * 2 + 1] = f.y
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
    let x: number, y: number, w: number, h: number

    if (this._frame) {
      x = this._frame.x
      y = this._frame.y
      w = this._frame.width
      h = this._frame.height
    } else {
      // Default: full texture
      x = 0
      y = 0
      w = 1
      h = 1
    }

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
    const c = readTrait(this._entity, SpriteColor, this._snapshot.color)

    for (let i = 0; i < 4; i++) {
      this._instanceColorBuffer[i * 4 + 0] = c.r
      this._instanceColorBuffer[i * 4 + 1] = c.g
      this._instanceColorBuffer[i * 4 + 2] = c.b
      this._instanceColorBuffer[i * 4 + 3] = c.a
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
    const material = this.material
    const EffectClass = effect.constructor as typeof MaterialEffect

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

    // 3. Set enable bit in flags bitmask
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectFlags |= (1 << bitIndex)

    // 4. Add trait to entity (if enrolled)
    if (this._entity) {
      this._entity.add(EffectClass._trait(this._buildTraitData(effect)))
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

    // 1. Clear enable bit in flags bitmask
    const bitIndex = material._effectBitIndex.get(EffectClass.effectName)!
    this._effectFlags &= ~(1 << bitIndex)

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

    // Write flags to slot 0
    this._writePackedSlotOwn(0, this._effectFlags)

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
   * Called automatically by Renderer2D when adding a sprite.
   *
   * @param world - The ECS world to enroll in (defaults to global world)
   * @internal
   */
  _enrollInWorld(world?: World): void {
    if (this._entity) return // Already enrolled

    const w = world ?? this._flatlandWorld ?? getGlobalWorld()
    this._flatlandWorld = w

    const s = this._snapshot
    this._entity = w.spawn(
      SpriteUV({ x: s.uv.x, y: s.uv.y, w: s.uv.w, h: s.uv.h }),
      SpriteColor({ r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a }),
      SpriteFlip({ x: s.flip.x, y: s.flip.y }),
      SpriteLayer({ layer: s.layer.layer }),
      SpriteZIndex({ zIndex: s.zIndex.zIndex }),
      SpriteMaterialRef({
        materialId: this.material.batchId,
      }),
      IsRenderable,
      ThreeRef({ object: this }),
    )

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
   * Called automatically when sprite is removed from Renderer2D or disposed.
   * @internal
   */
  _unenrollFromWorld(): void {
    if (!this._entity) return

    // Serialize trait values back to snapshot before destroying entity
    const color = this._entity.get(SpriteColor)
    if (color) Object.assign(this._snapshot.color, color)
    const uvVal = this._entity.get(SpriteUV)
    if (uvVal) Object.assign(this._snapshot.uv, uvVal)
    const flip = this._entity.get(SpriteFlip)
    if (flip) Object.assign(this._snapshot.flip, flip)
    const layer = this._entity.get(SpriteLayer)
    if (layer) Object.assign(this._snapshot.layer, layer)
    const zIdx = this._entity.get(SpriteZIndex)
    if (zIdx) Object.assign(this._snapshot.zIndex, zIdx)

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

    this._entity.destroy()
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

    // Dispose custom geometry if exists
    if (this._geometry) {
      this._geometry.dispose()
    }
    // Only dispose material if we created it
    this.material.dispose()
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
