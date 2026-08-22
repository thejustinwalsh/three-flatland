import { OrthographicCamera, Vector2, Vector4 } from 'three'

/** Pixel scale selection for {@link PixelPerfectCamera}. */
export type PixelScale = number | 'auto'

/** Options for {@link PixelPerfectCamera}. */
export interface PixelPerfectCameraOptions {
  /**
   * Minimum vertical world span kept visible when {@link pixelScale} is
   * `'auto'`. One world unit represents one source pixel. Default: `400`.
   */
  viewSize?: number
  /**
   * Optional minimum horizontal world span used together with `viewSize` for
   * automatic scale-to-fit. Omit it when only vertical framing matters.
   */
  viewWidth?: number
  /**
   * Physical framebuffer pixels per world unit. `'auto'` selects the largest
   * fitting integer scale, with a minimum of `1`. When the framebuffer is
   * smaller than the requested design extent, the camera crops instead of
   * introducing fractional downsampling. Default: `'auto'`.
   */
  pixelScale?: PixelScale
  /** Near clipping plane. Default: `0.1`. */
  near?: number
  /** Far clipping plane. Default: `1000`. */
  far?: number
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isPixelScale(value: PixelScale): boolean {
  return value === 'auto' || (isPositiveFinite(value) && Number.isInteger(value))
}

/**
 * An orthographic camera that maps world units to an integer number of
 * physical framebuffer pixels.
 *
 * One world unit is one source pixel. In automatic mode the camera chooses
 * the largest fitting integer scale, then centers an integer-sized viewport
 * inside the framebuffer. Leftover physical pixels become letterbox or
 * pillarbox bars instead of fractional world space. The automatic scale never
 * drops below `1`; a surface smaller than the requested design extent
 * therefore crops rather than downsampling.
 *
 * Call {@link setDrawingBufferSize} with physical framebuffer dimensions.
 * {@link Flatland} does this automatically for its viewport and render target.
 *
 * @example
 * ```ts
 * const camera = new PixelPerfectCamera({ viewSize: 240 })
 * camera.setDrawingBufferSize(1280, 720)
 * // resolvedPixelScale === 3; viewport is 1278 × 720 physical pixels
 * // and visible world is 426 × 240 units
 * ```
 */
export class PixelPerfectCamera extends OrthographicCamera {
  override type = 'PixelPerfectCamera'

  /** Canonical Three.js-style runtime type guard. */
  readonly isPixelPerfectCamera = true

  /** Prevent React Three Fiber from replacing the authored projection. */
  readonly manual = true

  /**
   * Centered physical-pixel viewport `(x, y, width, height)` for this
   * projection. Canvas renderers accept logical pixels, so divide by their DPR
   * before calling `renderer.setViewport()`. Render-target viewports already
   * use physical texels and can copy this value directly.
   */
  readonly viewport = new Vector4(0, 0, 400, 400)

  private _viewSize = 400
  private _viewWidth: number | undefined
  private _pixelScale: PixelScale = 'auto'
  private _resolvedPixelScale = 1
  private _drawingBufferWidth = 400
  private _drawingBufferHeight = 400
  private readonly _logicalViewport = new Vector4()
  private _updatingPixelProjection = false

  constructor(options: PixelPerfectCameraOptions = {}) {
    super(-200, 200, 200, -200, options.near ?? 0.1, options.far ?? 1000)

    if (options.viewSize !== undefined && isPositiveFinite(options.viewSize)) {
      this._viewSize = options.viewSize
    }
    if (options.viewWidth !== undefined && isPositiveFinite(options.viewWidth)) {
      this._viewWidth = options.viewWidth
    }
    if (options.pixelScale !== undefined && isPixelScale(options.pixelScale)) {
      this._pixelScale = options.pixelScale
    }

    this.position.z = 100
    this._updatePixelProjection()
  }

  /** Minimum vertical world span used by automatic scale selection. */
  get viewSize(): number {
    return this._viewSize
  }

  set viewSize(value: number) {
    if (!isPositiveFinite(value) || value === this._viewSize) return
    this._viewSize = value
    this._updatePixelProjection()
  }

  /** Optional minimum horizontal world span used by automatic fitting. */
  get viewWidth(): number | undefined {
    return this._viewWidth
  }

  set viewWidth(value: number | undefined) {
    if (value !== undefined && !isPositiveFinite(value)) return
    if (value === this._viewWidth) return
    this._viewWidth = value
    this._updatePixelProjection()
  }

  /** Requested pixel scale, or `'auto'` for integer scale-to-fit. */
  get pixelScale(): PixelScale {
    return this._pixelScale
  }

  set pixelScale(value: PixelScale) {
    if (!isPixelScale(value) || value === this._pixelScale) return
    this._pixelScale = value
    this._updatePixelProjection()
  }

  /** Physical framebuffer pixels occupied by one world unit. */
  get resolvedPixelScale(): number {
    return this._resolvedPixelScale
  }

  /** One physical framebuffer pixel expressed in world units. */
  get worldUnitsPerPixel(): number {
    return 1 / this._resolvedPixelScale
  }

  /** Last valid physical framebuffer width supplied to the camera. */
  get drawingBufferWidth(): number {
    return this._drawingBufferWidth
  }

  /** Last valid physical framebuffer height supplied to the camera. */
  get drawingBufferHeight(): number {
    return this._drawingBufferHeight
  }

  /**
   * Copy the physical viewport into the logical coordinate space expected by
   * a canvas renderer's `setViewport()`. Pass `1` for render-target texels.
   */
  getLogicalViewport(pixelRatio = 1, target = new Vector4()): Vector4 {
    if (!isPositiveFinite(pixelRatio)) pixelRatio = 1
    target.copy(this.viewport).divideScalar(pixelRatio)

    // Renderer common converts logical values back to physical pixels with
    // multiplyScalar(dpr).floor(). Nudge exact quotients upward by one ULP so
    // non-dyadic DPRs (1.1, 1.3, 1.75, …) cannot lose a framebuffer pixel to
    // floating-point round-off during that round trip.
    for (let index = 0; index < 4; index++) {
      const value = target.getComponent(index)
      target.setComponent(index, value + Math.max(1, Math.abs(value)) * Number.EPSILON)
    }
    return target
  }

  /**
   * Convert a top-left-origin canvas point in logical pixels to this camera's
   * normalized device coordinates. Values outside `[-1, 1]` are in the
   * letterbox or pillarbox region and should not participate in picking.
   */
  getNormalizedDeviceCoordinates(x: number, y: number, pixelRatio = 1, target = new Vector2()): Vector2 {
    if (!isPositiveFinite(pixelRatio)) pixelRatio = 1
    // Pointer math uses the exact logical boundary. The renderer-only ULP
    // nudge in getLogicalViewport must not move the event coordinate system.
    const logicalViewport = this._logicalViewport.copy(this.viewport).divideScalar(pixelRatio)
    const topInset = (this._drawingBufferHeight - this.viewport.y - this.viewport.height) / pixelRatio
    return target.set(
      ((x - logicalViewport.x) / logicalViewport.z) * 2 - 1,
      -((y - topInset) / logicalViewport.w) * 2 + 1
    )
  }

  /**
   * Round this camera's local X/Y position to one physical-pixel steps.
   *
   * Call this after a custom pan controller updates the camera. The operation
   * is explicit because camera position is application state; the render path
   * never mutates it behind the caller's back.
   */
  snapPositionToPixelGrid(): this {
    const step = this.worldUnitsPerPixel
    this.position.x = Math.round(this.position.x / step) * step
    this.position.y = Math.round(this.position.y / step) * step
    return this
  }

  /**
   * Fit the camera to physical framebuffer dimensions.
   *
   * Invalid or temporarily unmeasured sizes are ignored, leaving the last
   * valid projection intact.
   */
  setDrawingBufferSize(width: number, height: number): this {
    if (!isPositiveFinite(width) || !isPositiveFinite(height)) return this
    const physicalWidth = Math.floor(width)
    const physicalHeight = Math.floor(height)
    if (physicalWidth < 1 || physicalHeight < 1) return this
    if (physicalWidth === this._drawingBufferWidth && physicalHeight === this._drawingBufferHeight) return this

    this._drawingBufferWidth = physicalWidth
    this._drawingBufferHeight = physicalHeight
    this._updatePixelProjection()
    return this
  }

  /**
   * Convenience form for CSS viewport dimensions plus device pixel ratio.
   * Render targets should use {@link setDrawingBufferSize} directly.
   */
  setViewportSize(width: number, height: number, pixelRatio = 1): this {
    if (!isPositiveFinite(pixelRatio)) return this
    return this.setDrawingBufferSize(width * pixelRatio, height * pixelRatio)
  }

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive)
    this._viewSize = source._viewSize
    this._viewWidth = source._viewWidth
    this._pixelScale = source._pixelScale
    this._resolvedPixelScale = source._resolvedPixelScale
    this._drawingBufferWidth = source._drawingBufferWidth
    this._drawingBufferHeight = source._drawingBufferHeight
    this.viewport.copy(source.viewport)
    this._updatePixelProjection()
    return this
  }

  /**
   * Rebuild the projection after canonical Three.js controls mutate `zoom`.
   * Zoom is folded into the nearest positive integer pixel scale so it can
   * never introduce fractional source-pixel coverage.
   */
  override updateProjectionMatrix(): void {
    // OrthographicCamera's constructor dispatches here before subclass fields
    // exist. Let that one initialization use Three's ordinary implementation.
    if (this._updatingPixelProjection === undefined || this._updatingPixelProjection) {
      super.updateProjectionMatrix()
      return
    }
    this._updatePixelProjection()
  }

  private _updatePixelProjection(): void {
    const verticalFit = this._drawingBufferHeight / this._viewSize
    const fit =
      this._viewWidth === undefined ? verticalFit : Math.min(verticalFit, this._drawingBufferWidth / this._viewWidth)
    const fittedPixelScale = this._pixelScale === 'auto' ? Math.max(1, Math.floor(fit)) : this._pixelScale
    const zoom = isPositiveFinite(this.zoom) ? this.zoom : 1
    this._resolvedPixelScale = Math.max(1, Math.round(fittedPixelScale * zoom))

    const desiredPhysicalWidth =
      this._viewWidth === undefined
        ? Math.floor(this._drawingBufferWidth / this._resolvedPixelScale) * this._resolvedPixelScale
        : Math.floor(this._viewWidth * this._resolvedPixelScale)
    const desiredPhysicalHeight = Math.floor(this._viewSize * this._resolvedPixelScale)
    const viewportWidth = Math.max(1, Math.min(this._drawingBufferWidth, desiredPhysicalWidth))
    const viewportHeight = Math.max(1, Math.min(this._drawingBufferHeight, desiredPhysicalHeight))
    const viewportX = Math.floor((this._drawingBufferWidth - viewportWidth) / 2)
    const viewportY = Math.floor((this._drawingBufferHeight - viewportHeight) / 2)
    this.viewport.set(viewportX, viewportY, viewportWidth, viewportHeight)

    const halfWidth = viewportWidth / this._resolvedPixelScale / 2
    const halfHeight = viewportHeight / this._resolvedPixelScale / 2
    this.left = -halfWidth
    this.right = halfWidth
    this.top = halfHeight
    this.bottom = -halfHeight
    // The integer scale above already contains zoom. Temporarily neutralize
    // OrthographicCamera's own fractional zoom term while it builds the matrix.
    this._updatingPixelProjection = true
    const authoredZoom = this.zoom
    this.zoom = 1
    super.updateProjectionMatrix()
    this.zoom = authoredZoom
    this._updatingPixelProjection = false
  }
}
