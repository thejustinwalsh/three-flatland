import { Object3D, WebGLRenderTarget, LinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import type { WebGLRenderer, Texture } from 'three'
import { SkiaContext } from '../context'
import { Skia } from '../init'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'
import { SkiaGroup } from './SkiaGroup'
import { getFBOId, getWGPUTextureHandle } from './utils'

/**
 * Renderer type — Three.js WebGLRenderer or the new universal Renderer
 * (WebGPURenderer extends Renderer). We use a structural type so we
 * don't require the import of WebGPURenderer at the type level.
 */
type AnyRenderer = WebGLRenderer | {
  getContext(): unknown
  getRenderTarget(): unknown
  setRenderTarget(target: unknown): void
  backend?: { device?: unknown; get?(target: unknown): unknown }
}

export interface SkiaCanvasOptions {
  /** Three.js renderer (WebGLRenderer or WebGPURenderer) */
  renderer: AnyRenderer
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
 * Works with Three.js WebGLRenderer, WebGPURenderer (native WebGPU),
 * and WebGPURenderer in WebGL fallback mode. The backend is auto-detected
 * from the renderer via `Skia.init()`.
 *
 * ```ts
 * const skia = await Skia.init(renderer)
 * const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
 * await canvas.ready
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
  private _renderer: AnyRenderer

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

    // Create render target (used for both GL and WebGPU-with-GL-fallback).
    // WebGLRenderTarget is Three.js's universal render target — it works with
    // WebGPURenderer too (which wraps it internally regardless of backend).
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
   *
   * Supports all renderer types:
   *   - WebGLRenderer → extracts FBO ID
   *   - WebGPURenderer (native) → extracts GPUTexture handle
   *   - WebGPURenderer (WebGL fallback) → extracts FBO ID (same as WebGLRenderer)
   */
  render(renderer: AnyRenderer): void {
    if (!this._skiaContext) return
    if (!this._needsRedraw && !this._overlay) return

    const targetHandle = this._getTargetHandle(renderer)

    const ctx = this._skiaContext.beginDrawing(targetHandle, this.width, this.height)
    if (!ctx) return

    try {
      this._drawChildren(ctx, this)
    } finally {
      this._skiaContext.endDrawing()
      this._skiaContext.flush()
      this._skiaContext.resetState()
    }

    this._needsRedraw = false
  }

  /**
   * Get the target handle for the current backend.
   * Handles all three renderer scenarios.
   */
  private _getTargetHandle(renderer: AnyRenderer): number {
    if (this._overlay) return 0

    if (this._skiaContext!.backend === 'wgpu') {
      // Native WebGPU path — extract GPUTexture from render target
      return getWGPUTextureHandle(this._skiaContext!, renderer, this._renderTarget!)
    }

    // WebGL path — works for both WebGLRenderer and WebGPURenderer in fallback mode.
    // Both expose getRenderTarget/setRenderTarget and produce WebGL FBOs internally.
    return this._getGLTargetHandle(renderer)
  }

  /**
   * Extract FBO ID for the WebGL backend.
   * Works with WebGLRenderer directly, and also with WebGPURenderer
   * in WebGL fallback mode (which uses WebGLBackend internally).
   */
  private _getGLTargetHandle(renderer: AnyRenderer): number {
    // WebGLRenderer has renderer.properties — the classic Three.js API
    if ('properties' in renderer && renderer.properties) {
      const glRenderer = renderer as WebGLRenderer
      // Touch the render target to ensure Three.js has initialized its GL resources
      const currentTarget = glRenderer.getRenderTarget()
      glRenderer.setRenderTarget(this._renderTarget)
      glRenderer.setRenderTarget(currentTarget)
      return getFBOId(glRenderer, this._renderTarget!)
    }

    // WebGPURenderer in fallback mode — uses the new Renderer base class.
    // The WebGLBackend stores FBO data via backend.get(renderTarget).
    if ('backend' in renderer && renderer.backend) {
      const backend = renderer.backend as {
        get?: (target: unknown) => Record<string, unknown> | undefined
        gl?: WebGL2RenderingContext
      }

      // Ensure render target is initialized by touching it
      const currentTarget = renderer.getRenderTarget()
      renderer.setRenderTarget(this._renderTarget)
      renderer.setRenderTarget(currentTarget)

      if (backend.get) {
        const data = backend.get(this._renderTarget)
        if (data) {
          // WebGLBackend stores framebuffer info
          const fb = data.framebuffer ?? data.__webglFramebuffer
          if (typeof fb === 'number') return fb
        }
      }
    }

    // Fallback: default FBO (canvas)
    return 0
  }

  private _drawChildren(ctx: SkiaDrawingContext, parent: Object3D): void {
    for (const child of parent.children) {
      if (!child.visible) continue
      if (child instanceof SkiaGroup) {
        child._draw(ctx, this._skiaContext!)
      } else if (child instanceof SkiaNode) {
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
