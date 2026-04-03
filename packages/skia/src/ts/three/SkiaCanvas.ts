import { Object3D, WebGLRenderTarget, LinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import type { WebGLRenderer, Texture } from 'three'
import { SkiaContext } from '../context'
import { Skia } from '../init'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'
import { getFBOId } from './utils'

export interface SkiaCanvasOptions {
  /** Three.js WebGL renderer */
  renderer: WebGLRenderer
  /** Canvas width in pixels */
  width: number
  /** Canvas height in pixels */
  height: number
  /** If true, draw to the default framebuffer (HUD/overlay mode) instead of a render target */
  overlay?: boolean
}

/**
 * Root Skia canvas node — owns the render target and walks children to draw.
 *
 * Automatically initializes the Skia context from the renderer on first render
 * if `Skia.init()` hasn't been called yet.
 *
 * ```ts
 * // Option 1: explicit init (recommended for vanilla Three.js)
 * const skia = await Skia.init(renderer)
 * const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
 *
 * // Option 2: lazy init (SkiaCanvas calls Skia.init internally)
 * const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
 * await canvas.ready  // wait for WASM to load
 * ```
 */
export class SkiaCanvas extends Object3D {
  readonly width: number
  readonly height: number

  /** Resolves when the Skia context is ready */
  readonly ready: Promise<SkiaContext>

  private _skiaContext: SkiaContext | null
  private _renderTarget: WebGLRenderTarget | null = null
  private _overlay: boolean
  private _needsRedraw = true
  private _renderer: WebGLRenderer

  constructor(options: SkiaCanvasOptions) {
    super()
    this.width = options.width
    this.height = options.height
    this._overlay = options.overlay ?? false
    this._renderer = options.renderer

    // Use existing context or init from renderer
    this._skiaContext = SkiaContext.instance
    if (this._skiaContext) {
      this.ready = Promise.resolve(this._skiaContext)
    } else {
      this.ready = Skia.init(options.renderer).then((ctx) => {
        this._skiaContext = ctx
        return ctx
      })
    }

    if (!this._overlay) {
      this._renderTarget = new WebGLRenderTarget(options.width, options.height, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        type: UnsignedByteType,
        stencilBuffer: true,
      })
    }
  }

  /** The SkiaContext (null until ready) */
  get skiaContext(): SkiaContext | null {
    return this._skiaContext
  }

  /** The output texture (render target mode). Null in overlay mode. */
  get texture(): Texture | null {
    return this._renderTarget?.texture ?? null
  }

  /** Mark as needing redraw */
  invalidate(): void {
    this._needsRedraw = true
  }

  /**
   * Render the Skia scene graph to the framebuffer.
   * No-op if the Skia context isn't ready yet.
   */
  render(renderer: WebGLRenderer): void {
    if (!this._skiaContext) return // not ready yet
    if (!this._needsRedraw && !this._overlay) return

    let fboId: number
    if (this._overlay) {
      fboId = 0
    } else {
      const currentTarget = renderer.getRenderTarget()
      renderer.setRenderTarget(this._renderTarget)
      renderer.setRenderTarget(currentTarget)
      fboId = getFBOId(renderer, this._renderTarget!)
    }

    const ctx = this._skiaContext.beginDrawing(fboId, this.width, this.height)
    if (!ctx) return

    try {
      this._drawChildren(ctx, this)
    } finally {
      this._skiaContext.endDrawing()
      this._skiaContext.flush()
      this._skiaContext.resetGLState()
    }

    this._needsRedraw = false
  }

  private _drawChildren(ctx: SkiaDrawingContext, parent: Object3D): void {
    for (const child of parent.children) {
      if (!child.visible) continue
      if (child instanceof SkiaNode) {
        child._draw(ctx, this._skiaContext!)
      } else if (child instanceof Object3D && child.children.length > 0) {
        this._drawChildren(ctx, child)
      }
    }
  }

  setSize(width: number, height: number): void {
    (this as { width: number }).width = width
    ;(this as { height: number }).height = height
    if (this._renderTarget) this._renderTarget.setSize(width, height)
    this.invalidate()
  }

  dispose(): void {
    this._renderTarget?.dispose()
    this._renderTarget = null
  }
}
