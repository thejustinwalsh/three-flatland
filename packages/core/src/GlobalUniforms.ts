import { Vector2, Color } from 'three'
import { uniform } from 'three/tsl'
import type { TSLNode } from './nodes/types'

/**
 * Global uniforms shared across all sprite materials in a Flatland instance.
 *
 * These uniforms are set once per frame and shared by all sprites.
 * They avoid per-sprite duplication and never cause shader recompilation.
 *
 * @example
 * ```typescript
 * // Flatland creates and owns the global uniforms
 * const globals = flatland.globals
 *
 * // Access TSL nodes in custom colorTransform
 * const material = new Sprite2DMaterial({
 *   colorTransform: (ctx) => {
 *     const tinted = ctx.color.rgb.mul(globals.globalTintNode)
 *     return tinted.toVec4(ctx.color.a)
 *   }
 * })
 *
 * // Each frame, Flatland updates the values
 * // (or set them directly for manual control)
 * globals.time = performance.now() / 1000
 * globals.globalTint = new Color(0.8, 0.9, 1.0) // moonlight
 * ```
 */
export class GlobalUniforms {
  // ============================================
  // BACKING VALUES (JS-side, mutated per-frame)
  // ============================================

  /**
   * User-facing time value.
   * - `undefined` = auto mode (Flatland accumulates elapsed time)
   * - `number` = manual mode (use this exact value)
   */
  private _time: number | undefined = undefined

  /** Auto-accumulated elapsed time (seconds), used when _time is undefined */
  private _autoTime = 0

  /** Global color tint applied to all sprites */
  private _globalTint: Color = new Color(1, 1, 1)

  /** Viewport size in pixels */
  private _viewportSize: Vector2 = new Vector2(1, 1)

  /** Device pixel ratio */
  private _pixelRatio = 1

  /** Wind direction and strength (xy = direction, magnitude = strength) */
  private _wind: Vector2 = new Vector2(0, 0)

  /** Fog color */
  private _fogColor: Color = new Color(0, 0, 0)

  /** Fog range: x = near, y = far */
  private _fogRange: Vector2 = new Vector2(0, 1000)

  // ============================================
  // TSL UNIFORM NODES (created once, never recompiled)
  // ============================================

  /** Time uniform node (float) */
  readonly timeNode: TSLNode
  /** Global tint uniform node (vec3/color) */
  readonly globalTintNode: TSLNode
  /** Viewport size uniform node (vec2) */
  readonly viewportSizeNode: TSLNode
  /** Pixel ratio uniform node (float) */
  readonly pixelRatioNode: TSLNode
  /** Wind uniform node (vec2 — direction * strength) */
  readonly windNode: TSLNode
  /** Fog color uniform node (vec3/color) */
  readonly fogColorNode: TSLNode
  /** Fog range uniform node (vec2 — near, far) */
  readonly fogRangeNode: TSLNode

  constructor() {
    this.timeNode = uniform(0)
    this.globalTintNode = uniform(this._globalTint)
    this.viewportSizeNode = uniform(this._viewportSize)
    this.pixelRatioNode = uniform(this._pixelRatio)
    this.windNode = uniform(this._wind)
    this.fogColorNode = uniform(this._fogColor)
    this.fogRangeNode = uniform(this._fogRange)
  }

  // ============================================
  // GETTERS / SETTERS
  // ============================================

  /**
   * Get/set time.
   * - `undefined` = auto mode (accumulates elapsed time via updateTime())
   * - `number` = manual mode (exact value used for shader time)
   *
   * Setting back to `undefined` resumes auto-accumulation from where it left off.
   */
  get time(): number | undefined {
    return this._time
  }

  set time(value: number | undefined) {
    this._time = value
    if (value !== undefined) {
      this.timeNode.value = value
    }
  }

  /**
   * Get the current effective time value (what the shader sees).
   */
  get effectiveTime(): number {
    return this._time ?? this._autoTime
  }

  /**
   * Advance auto-time by delta seconds.
   * Called by Flatland each frame. In auto mode, this accumulates
   * and updates the time node. In manual mode, this is a no-op
   * (the manual value is already set via the setter).
   */
  updateTime(delta: number): void {
    this._autoTime += delta
    if (this._time === undefined) {
      this.timeNode.value = this._autoTime
    }
  }

  get globalTint(): Color {
    return this._globalTint
  }

  set globalTint(value: Color) {
    this._globalTint.copy(value)
  }

  get viewportSize(): Vector2 {
    return this._viewportSize
  }

  set viewportSize(value: Vector2) {
    this._viewportSize.copy(value)
  }

  get pixelRatio(): number {
    return this._pixelRatio
  }

  set pixelRatio(value: number) {
    this._pixelRatio = value
    this.pixelRatioNode.value = value
  }

  get wind(): Vector2 {
    return this._wind
  }

  set wind(value: Vector2) {
    this._wind.copy(value)
  }

  get fogColor(): Color {
    return this._fogColor
  }

  set fogColor(value: Color) {
    this._fogColor.copy(value)
  }

  get fogRange(): Vector2 {
    return this._fogRange
  }

  set fogRange(value: Vector2) {
    this._fogRange.copy(value)
  }
}
