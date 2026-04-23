import { Object3D, Color, Vector2, type ColorRepresentation } from 'three'

/**
 * Light type for 2D lighting.
 */
export type Light2DType = 'point' | 'directional' | 'spot' | 'ambient'

/**
 * Options for creating a Light2D.
 */
export interface Light2DOptions {
  /** Light type */
  type?: Light2DType
  /** Light color */
  color?: ColorRepresentation
  /** Light intensity (default: 1) */
  intensity?: number
  /** Position for point/spot lights */
  position?: [number, number] | Vector2
  /** Direction for directional/spot lights (normalized automatically) */
  direction?: [number, number] | Vector2
  /** Maximum light distance for point/spot lights (0 = no cutoff, default: 0) */
  distance?: number
  /** Cone angle for spot lights (radians, default: Math.PI/4) */
  angle?: number
  /** Penumbra for spot lights (0-1, default: 0) */
  penumbra?: number
  /** Decay exponent controlling attenuation curve shape (default: 2 for quadratic) */
  decay?: number
  /** Whether this light casts shadows (default: true) */
  castsShadow?: boolean
}

/**
 * Uniform data structure for passing to shaders.
 */
export interface Light2DUniforms {
  type: Light2DType
  position: Vector2
  direction: Vector2
  color: Color
  intensity: number
  distance: number
  angle: number
  penumbra: number
  decay: number
  castsShadow: boolean
}

/**
 * 2D Light for use with Flatland.
 *
 * Light2D is a scene graph object that can be added to Flatland
 * and automatically collected for use in sprite lighting.
 *
 * @example
 * ```typescript
 * // Point light (torch, lamp)
 * const torch = new Light2D({
 *   type: 'point',
 *   position: [100, 100],
 *   color: 'orange',
 *   intensity: 1.5,
 *   distance: 200,
 * })
 * flatland.add(torch)
 *
 * // Directional light (sun)
 * const sun = new Light2D({
 *   type: 'directional',
 *   direction: [1, -1],
 *   color: 0xffffcc,
 *   intensity: 0.8,
 * })
 * flatland.add(sun)
 *
 * // Ambient light (base illumination)
 * const ambient = new Light2D({
 *   type: 'ambient',
 *   color: 0x222233,
 *   intensity: 0.3,
 * })
 * flatland.add(ambient)
 * ```
 */
export class Light2D extends Object3D {
  /**
   * Type identifier for Three.js.
   */
  override readonly type = 'Light2D'

  /**
   * Light type.
   */
  lightType: Light2DType

  /**
   * Light color.
   */
  private _color: Color

  /**
   * Light intensity.
   */
  intensity: number

  /**
   * Direction for directional/spot lights.
   */
  private _direction: Vector2

  /**
   * Maximum light distance for point/spot lights.
   * 0 = no cutoff (infinite range). The lighting system will
   * determine an effective max distance for culling purposes.
   */
  distance: number

  /**
   * Cone angle for spot lights (radians).
   */
  angle: number

  /**
   * Penumbra for spot lights (0-1).
   */
  penumbra: number

  /**
   * Decay exponent controlling attenuation curve shape.
   * 1 = linear, 2 = quadratic (default), higher = sharper center.
   */
  decay: number

  /**
   * Whether this light is enabled.
   */
  enabled: boolean = true

  /**
   * Whether this light casts shadows. When false, the shader skips the
   * SDF shadow trace for this light — useful for cosmetic/atmospheric
   * lights (slime glows, ambient fills) that don't need occlusion.
   */
  castsShadow: boolean = true

  constructor(options: Light2DOptions = {}) {
    super()

    this.name = 'Light2D'
    this.lightType = options.type ?? 'point'
    this._color = new Color(options.color ?? 0xffffff)
    this.intensity = options.intensity ?? 1

    // Position (use Object3D.position.x/y)
    if (options.position) {
      if (Array.isArray(options.position)) {
        this.position.set(options.position[0], options.position[1], 0)
      } else {
        this.position.set(options.position.x, options.position.y, 0)
      }
    }

    // Direction
    this._direction = new Vector2(0, -1)
    if (options.direction) {
      if (Array.isArray(options.direction)) {
        this._direction.set(options.direction[0], options.direction[1])
      } else {
        this._direction.copy(options.direction)
      }
      this._direction.normalize()
    }

    this.distance = options.distance ?? 0
    this.angle = options.angle ?? Math.PI / 4
    this.penumbra = options.penumbra ?? 0
    this.decay = options.decay ?? 2
    this.castsShadow = options.castsShadow ?? true
  }

  /**
   * Get light color.
   */
  get color(): Color {
    return this._color
  }

  /**
   * Set light color.
   */
  set color(value: ColorRepresentation) {
    if (value instanceof Color) {
      this._color.copy(value)
    } else {
      this._color.set(value)
    }
  }

  /**
   * Get light direction (for directional/spot lights).
   */
  get direction(): Vector2 {
    return this._direction
  }

  /**
   * Set light direction (normalized automatically).
   */
  set direction(value: Vector2 | [number, number]) {
    if (Array.isArray(value)) {
      this._direction.set(value[0], value[1])
    } else {
      this._direction.copy(value)
    }
    this._direction.normalize()
  }

  /**
   * Get the 2D position from Object3D position.
   */
  get position2D(): Vector2 {
    return new Vector2(this.position.x, this.position.y)
  }

  /**
   * Set the 2D position (updates Object3D.position.x/y).
   */
  set position2D(value: Vector2 | [number, number]) {
    if (Array.isArray(value)) {
      this.position.set(value[0], value[1], this.position.z)
    } else {
      this.position.set(value.x, value.y, this.position.z)
    }
  }

  /**
   * Get uniforms for shader use.
   */
  getUniforms(): Light2DUniforms {
    return {
      type: this.lightType,
      position: this.position2D,
      direction: this._direction.clone(),
      color: this._color.clone(),
      intensity: this.intensity,
      distance: this.distance,
      angle: this.angle,
      penumbra: this.penumbra,
      decay: this.decay,
      castsShadow: this.castsShadow,
    }
  }

  /**
   * Clone this light.
   */
  override clone(): this {
    const light = new Light2D({
      type: this.lightType,
      color: this._color.clone(),
      intensity: this.intensity,
      position: [this.position.x, this.position.y],
      direction: [this._direction.x, this._direction.y],
      distance: this.distance,
      angle: this.angle,
      penumbra: this.penumbra,
      decay: this.decay,
    })
    light.enabled = this.enabled
    light.castsShadow = this.castsShadow
    return light as this
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // No GPU resources to dispose
  }
}

/**
 * Type guard for Light2D.
 */
export function isLight2D(object: unknown): object is Light2D {
  return object instanceof Light2D
}
