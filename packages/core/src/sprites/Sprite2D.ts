import { Mesh, PlaneGeometry, Vector2, Vector3, type Color, type Texture } from 'three'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { Sprite2DOptions, SpriteFrame } from './types'

// Shared geometry for all sprites (memory optimization)
const sharedGeometry = new PlaneGeometry(1, 1)

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

  /** Flip state */
  private _flipX: boolean = false
  private _flipY: boolean = false

  /** Pixel-perfect mode */
  pixelPerfect: boolean = false

  /** Custom geometry for anchor offset */
  private _geometry: PlaneGeometry | null = null

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

    // Use shared geometry initially
    super(sharedGeometry, material)

    // Frustum culling friendly name
    this.name = 'Sprite2D'
    this.frustumCulled = true

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
      this.updateSize()
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
        this.updateSize()
      }
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
   */
  setFrame(frame: SpriteFrame): this {
    this._frame = frame
    this.material.setFrame(frame.x, frame.y, frame.width, frame.height)
    this.updateSize()
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
    return this.material.tintColor.value.clone()
  }

  /**
   * Set tint color.
   */
  set tint(value: Color | string | number) {
    this.material.setTint(value)
  }

  /**
   * Get alpha/opacity.
   */
  get alpha(): number {
    return this.material.alphaValue.value
  }

  /**
   * Set alpha/opacity (0-1).
   */
  set alpha(value: number) {
    this.material.setAlpha(value)
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

    // Dispose old custom geometry if exists
    if (this._geometry) {
      this._geometry.dispose()
    }

    // Create new geometry with offset
    this._geometry = sharedGeometry.clone()
    this._geometry.translate(offsetX, offsetY, 0)
    this.geometry = this._geometry
  }

  /**
   * Update flip flags on material.
   */
  private updateFlip() {
    this.material.setFlip(this._flipX, this._flipY)
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
