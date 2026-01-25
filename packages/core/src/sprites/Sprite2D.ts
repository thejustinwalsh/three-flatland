import {
  Mesh,
  PlaneGeometry,
  Vector2,
  Vector3,
  Color,
  BufferAttribute,
  type Texture,
} from 'three'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { Sprite2DOptions, SpriteFrame } from './types'

/**
 * A 2D sprite for use with three-flatland's render pipeline.
 *
 * Extends THREE.Mesh, so it works with standard Three.js scene graph
 * but designed for batched 2D rendering with explicit z-ordering.
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
  /** Render layer (primary sort key for Renderer2D) */
  layer: number = 0

  /** Z-index within layer (secondary sort key) */
  zIndex: number = 0

  /**
   * Per-instance attribute values for TSL-native batching.
   * These are defined by the material and read during batch rendering.
   */
  private instanceValues: Map<string, number | number[]> = new Map()

  /** Anchor point (0-1), affects positioning */
  private _anchor: Vector2 = new Vector2(0.5, 0.5)

  /** Current frame */
  private _frame: SpriteFrame | null = null

  /** Source texture */
  private _texture: Texture | null = null

  /** Tint color */
  private _tint: Color = new Color(1, 1, 1)

  /** Alpha/opacity (0-1) */
  private _alpha: number = 1

  /** Flip state */
  private _flipX: boolean = false
  private _flipY: boolean = false

  /** Pixel-perfect mode */
  pixelPerfect: boolean = false

  /** Custom geometry for anchor offset */
  private _geometry: PlaneGeometry | null = null

  /**
   * Instance attribute buffers for single-sprite rendering.
   * PlaneGeometry has 4 vertices, so we need 4 copies of each value.
   */
  // instanceUV: 4 vertices × vec4 = 16 floats
  private _instanceUVBuffer: Float32Array = new Float32Array([
    0, 0, 1, 1, // vertex 0
    0, 0, 1, 1, // vertex 1
    0, 0, 1, 1, // vertex 2
    0, 0, 1, 1, // vertex 3
  ])
  // instanceColor: 4 vertices × vec4 = 16 floats
  private _instanceColorBuffer: Float32Array = new Float32Array([
    1, 1, 1, 1, // vertex 0
    1, 1, 1, 1, // vertex 1
    1, 1, 1, 1, // vertex 2
    1, 1, 1, 1, // vertex 3
  ])
  // instanceFlip: 4 vertices × vec2 = 8 floats
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
    // Create material (texture can be set later)
    const material =
      options?.material ??
      new Sprite2DMaterial({
        map: options?.texture,
        transparent: true,
      })

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
      this._updateInstanceUV()
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
      this._flipX = options.flipX
    }

    if (options.flipY !== undefined) {
      this._flipY = options.flipY
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

    this.updateFlip()
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
        this._updateInstanceUV()
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
   * Set the current frame.
   * Note: Does not modify scale - call updateSize() manually if needed after first frame.
   */
  setFrame(frame: SpriteFrame): this {
    const isFirstFrame = this._frame === null
    this._frame = frame
    this._updateInstanceUV()
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
    return this._tint.clone()
  }

  /**
   * Set tint color.
   */
  set tint(value: Color | string | number) {
    if (value instanceof Color) {
      this._tint.copy(value)
    } else if (typeof value === 'string') {
      this._tint.set(value)
    } else {
      this._tint.set(value)
    }
    this._updateInstanceColor()
  }

  /**
   * Get alpha/opacity.
   */
  get alpha(): number {
    return this._alpha
  }

  /**
   * Set alpha/opacity (0-1).
   */
  set alpha(value: number) {
    this._alpha = value
    this._updateInstanceColor()
  }

  /**
   * Get flipX state.
   */
  get flipX(): boolean {
    return this._flipX
  }

  /**
   * Set flipX state.
   */
  set flipX(value: boolean) {
    this._flipX = value
    this.updateFlip()
  }

  /**
   * Get flipY state.
   */
  get flipY(): boolean {
    return this._flipY
  }

  /**
   * Set flipY state.
   */
  set flipY(value: boolean) {
    this._flipY = value
    this.updateFlip()
  }

  /**
   * Flip the sprite.
   */
  flip(horizontal: boolean, vertical: boolean): this {
    this._flipX = horizontal
    this._flipY = vertical
    this.updateFlip()
    return this
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
   * Update flip flags in instance attribute (all 4 vertices).
   */
  private updateFlip() {
    const flipX = this._flipX ? -1 : 1
    const flipY = this._flipY ? -1 : 1

    // Write to all 4 vertices
    for (let i = 0; i < 4; i++) {
      this._instanceFlipBuffer[i * 2 + 0] = flipX
      this._instanceFlipBuffer[i * 2 + 1] = flipY
    }

    const flipAttr = this.geometry.getAttribute('instanceFlip') as BufferAttribute
    if (flipAttr) {
      flipAttr.needsUpdate = true
    }
  }

  /**
   * Set up instance attributes on the geometry for single-sprite rendering.
   * These are the same attributes used by SpriteBatch for batched rendering.
   */
  private _setupInstanceAttributes() {
    const geo = this.geometry

    // instanceUV: vec4 (x, y, width, height) - frame in atlas
    const uvAttr = new BufferAttribute(this._instanceUVBuffer, 4)
    geo.setAttribute('instanceUV', uvAttr)

    // instanceColor: vec4 (r, g, b, a) - tint color and alpha
    const colorAttr = new BufferAttribute(this._instanceColorBuffer, 4)
    geo.setAttribute('instanceColor', colorAttr)

    // instanceFlip: vec2 (x, y) - flip flags (1 = normal, -1 = flipped)
    const flipAttr = new BufferAttribute(this._instanceFlipBuffer, 2)
    geo.setAttribute('instanceFlip', flipAttr)
  }

  /**
   * Update the instanceUV attribute from current frame (all 4 vertices).
   */
  private _updateInstanceUV() {
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

    // Write to all 4 vertices
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
   * Update the instanceColor attribute from current tint and alpha (all 4 vertices).
   */
  private _updateInstanceColor() {
    const r = this._tint.r
    const g = this._tint.g
    const b = this._tint.b
    const a = this._alpha

    // Write to all 4 vertices
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
  // TSL-NATIVE INSTANCE ATTRIBUTE SYSTEM
  // ============================================

  /**
   * Set a per-instance attribute value.
   * The attribute must be defined on the material via addInstanceFloat(), etc.
   *
   * @example
   * ```typescript
   * // Material defines the attribute
   * material.addInstanceFloat('dissolve', 0);
   *
   * // Sprite sets its value
   * sprite.setInstanceValue('dissolve', 0.5);
   * ```
   */
  setInstanceValue(name: string, value: number | number[]): this {
    this.instanceValues.set(name, value)
    return this
  }

  /**
   * Get a per-instance attribute value.
   */
  getInstanceValue(name: string): number | number[] | undefined {
    return this.instanceValues.get(name)
  }

  /**
   * Get all instance values (for SpriteBatch).
   */
  getInstanceValues(): Map<string, number | number[]> {
    return this.instanceValues
  }

  /**
   * Clear all instance values (reset to material defaults).
   */
  clearInstanceValues(): this {
    this.instanceValues.clear()
    return this
  }

  /**
   * Update the matrix with automatic Z offset for depth-based layer/zIndex sorting.
   * This ensures proper rendering order whether the sprite is standalone or batched.
   *
   * Z offset formula: layer * 10 + zIndex * 0.001
   * Higher layer/zIndex = higher Z = closer to camera = renders in front
   */
  override updateMatrix(): void {
    // Store original Z position
    const originalZ = this.position.z

    // Apply Z offset based on layer and zIndex for depth sorting
    this.position.z += this.layer * 10 + this.zIndex * 0.001

    // Compute matrix with offset
    super.updateMatrix()

    // Restore original Z position (so user's position.z is preserved)
    this.position.z = originalZ
  }

  /**
   * Dispose of resources.
   */
  dispose() {
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
            flipX: this._flipX,
            flipY: this._flipY,
            layer: this.layer,
            zIndex: this.zIndex,
            pixelPerfect: this.pixelPerfect,
          }
        : undefined
    )
    // Clone instance values
    for (const [name, value] of this.instanceValues) {
      cloned.setInstanceValue(name, Array.isArray(value) ? [...value] : value)
    }
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    return cloned as this
  }
}
