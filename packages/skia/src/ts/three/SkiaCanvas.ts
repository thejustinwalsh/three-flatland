import { Object3D, WebGLRenderTarget, LinearFilter, RGBAFormat, UnsignedByteType, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { SkiaContext } from '../context'
import { Skia } from '../init'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'
import { SkiaGroup } from './SkiaGroup'
import { getFBOId, getCanvasTexture, getWGPUDevice } from './utils'
import { SkiaBlitPipeline } from './SkiaBlitPipeline'

// ── GL state save/restore for shared context usage ──

interface SavedGLState {
  program: WebGLProgram | null
  vao: WebGLVertexArrayObject | null
  arrayBuffer: WebGLBuffer | null
  elementArrayBuffer: WebGLBuffer | null
  activeTexture: number
  texture2D: WebGLTexture | null
  framebuffer: WebGLFramebuffer | null
  renderbuffer: WebGLRenderbuffer | null
  viewport: Int32Array
  scissorBox: Int32Array
  scissorTest: boolean
  blend: boolean
  depthTest: boolean
  depthMask: boolean
  cullFace: boolean
  stencilTest: boolean
  attribs: Array<{ enabled: boolean }>
}

function saveGLState(gl: WebGL2RenderingContext): SavedGLState {
  const maxAttrs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number
  const attribs: SavedGLState['attribs'] = []
  for (let i = 0; i < maxAttrs; i++) {
    attribs.push({
      enabled: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean,
    })
  }

  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    elementArrayBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
    texture2D: gl.getParameter(gl.TEXTURE_BINDING_2D),
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING),
    viewport: gl.getParameter(gl.VIEWPORT),
    scissorBox: gl.getParameter(gl.SCISSOR_BOX),
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    blend: gl.isEnabled(gl.BLEND),
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    cullFace: gl.isEnabled(gl.CULL_FACE),
    stencilTest: gl.isEnabled(gl.STENCIL_TEST),
    attribs,
  }
}

function restoreGLState(gl: WebGL2RenderingContext, s: SavedGLState): void {
  gl.bindVertexArray(s.vao)

  for (let i = 0; i < s.attribs.length; i++) {
    if (s.attribs[i]!.enabled) gl.enableVertexAttribArray(i)
    else gl.disableVertexAttribArray(i)
  }

  gl.useProgram(s.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, s.arrayBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.elementArrayBuffer)
  gl.activeTexture(s.activeTexture)
  gl.bindTexture(gl.TEXTURE_2D, s.texture2D)
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer)
  gl.bindRenderbuffer(gl.RENDERBUFFER, s.renderbuffer)

  gl.viewport(s.viewport[0]!, s.viewport[1]!, s.viewport[2]!, s.viewport[3]!)
  gl.scissor(s.scissorBox[0]!, s.scissorBox[1]!, s.scissorBox[2]!, s.scissorBox[3]!)

  if (s.scissorTest) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST)
  if (s.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND)
  if (s.depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST)
  gl.depthMask(s.depthMask)
  if (s.cullFace) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE)
  if (s.stencilTest) gl.enable(gl.STENCIL_TEST); else gl.disable(gl.STENCIL_TEST)
}

/**
 * Renderer type — any Three.js renderer (WebGLRenderer, WebGPURenderer, etc.).
 * Uses a minimal structural type so we don't depend on WebGPURenderer at the type level.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AnyRenderer extends Record<string, any> {
  getContext(): unknown
  getRenderTarget(): unknown
  setRenderTarget(target: unknown): void
}

export interface SkiaCanvasOptions {
  /** Three.js renderer (WebGLRenderer or WebGPURenderer) */
  renderer?: AnyRenderer
  /** Canvas width in pixels */
  width?: number
  /** Canvas height in pixels */
  height?: number
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
 * Supports both eager construction (pass options to constructor) and
 * R3F-style lazy init (set properties after `new SkiaCanvas()`).
 * Skia context loading starts as soon as `renderer` is set.
 *
 * ```ts
 * // Vanilla — eager
 * const canvas = new SkiaCanvas({ renderer, width: 512, height: 512 })
 * await canvas.ready
 *
 * // R3F — declarative (props set by reconciler)
 * <skiaCanvas renderer={gl} width={512} height={512} overlay />
 * ```
 */
let _canvasConfigured = false
let _blitPipeline: SkiaBlitPipeline | null = null

export class SkiaCanvas extends Object3D {
  private _width = 0
  private _height = 0
  private _overlay = false
  private _renderer: AnyRenderer | null = null

  private _skiaContext: SkiaContext | null = null
  private _renderTarget: WebGLRenderTarget | null = null
  private _needsRedraw = true
  // WebGL texture mode: we create our own FBO since we can't extract Three.js's FBO ID
  private _glFBO: WebGLFramebuffer | null = null
  private _glTex: WebGLTexture | null = null
  private _glFBOSize: [number, number] = [0, 0]

  private _readyPromise: Promise<SkiaContext> | null = null
  private _readyResolve: ((ctx: SkiaContext) => void) | null = null


  constructor(options?: SkiaCanvasOptions) {
    super()
    if (options) {
      if (options.width != null) this._width = options.width
      if (options.height != null) this._height = options.height
      if (options.overlay != null) this._overlay = options.overlay
      if (options.renderer) this.renderer = options.renderer
    }
  }

  // ── Public properties ──

  get renderer(): AnyRenderer | null { return this._renderer }
  set renderer(v: AnyRenderer | null) {
    if (v === this._renderer) return
    this._renderer = v
    if (v) this._initSkia(v)
  }

  get width(): number { return this._width }
  set width(v: number) {
    if (v === this._width) return
    this._width = v
    this._syncRenderTarget()
  }

  get height(): number { return this._height }
  set height(v: number) {
    if (v === this._height) return
    this._height = v
    this._syncRenderTarget()
  }

  get overlay(): boolean { return this._overlay }
  set overlay(v: boolean) {
    if (v === this._overlay) return
    this._overlay = v
    this._syncRenderTarget()
  }

  /** The SkiaContext (null until ready) */
  get skiaContext(): SkiaContext | null {
    return this._skiaContext
  }

  /** The output texture (render target mode). Null in overlay mode. */
  get texture(): Texture | null {
    return this._renderTarget?.texture ?? null
  }

  /** Resolves when the Skia context is ready */
  get ready(): Promise<SkiaContext> {
    if (this._skiaContext) return Promise.resolve(this._skiaContext)
    if (!this._readyPromise) {
      this._readyPromise = new Promise<SkiaContext>((resolve) => {
        this._readyResolve = resolve
      })
    }
    return this._readyPromise
  }

  /** Mark as needing redraw */
  invalidate(): void {
    this._needsRedraw = true
  }

  /**
   * Render the Skia scene graph to the framebuffer.
   * No-op if the Skia context isn't ready yet.
   *
   * When sharing a WebGL context with Three.js, saves the GL state,
   * resets to a clean baseline for Skia, draws, then restores the
   * previous state so Three.js can continue without disruption.
   */
  render(renderer: AnyRenderer): void {
    if (!this._skiaContext) return
    if (!this._needsRedraw && !this._overlay) return

    const targetHandle = this._getTargetHandle(renderer)
    const gl = this._skiaContext.backend === 'webgl' ? this._skiaContext.gl : null
    const saved = gl ? saveGLState(gl) : null

    // Reset to clean GL baseline before Skia draws
    if (gl) {
      gl.bindVertexArray(null)
      gl.useProgram(null)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
      const maxAttrs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number
      for (let i = 0; i < maxAttrs; i++) gl.disableVertexAttribArray(i)
    }
    this._skiaContext.resetState()

    // WebGL texture mode: wrap Three.js's GL texture directly
    let ctx: SkiaDrawingContext | null = null
    if (targetHandle === -1 && this._skiaContext.backend === 'webgl') {
      const texId = this._getOrRegisterGLTexture(renderer)
      if (texId > 0) {
        ctx = this._skiaContext.beginDrawingGLTexture(texId, this._width, this._height)
      }
    }
    if (!ctx && targetHandle !== -1) {
      ctx = this._skiaContext.beginDrawing(targetHandle, this._width, this._height)
    }
    if (!ctx) {
      if (saved && gl) restoreGLState(gl, saved)
      return
    }

    try {
      // Texture mode: clear the surface (WrapBackendTexture doesn't clear between frames)
      if (!this._overlay) ctx.clear(0, 0, 0, 0)
      this._drawChildren(ctx, this)
    } finally {
      this._skiaContext.endDrawing()
      this._skiaContext.flush()
      this._skiaContext.resetState()
      if (saved && gl) restoreGLState(gl, saved)
    }

    // WebGPU compositing: copy Skia's internal texture to the destination
    if (this._skiaContext?.backend === 'wgpu') {
      const wgpuState = this._skiaContext._wgpuState
      const skiaTex = wgpuState?.lastRenderTargetTexture
      if (skiaTex) {
        const dev = getWGPUDevice(renderer)
        if (dev) {
          if (this._overlay) {
            // Overlay mode: blit to canvas with premultiplied alpha blending
            // (copyTextureToTexture can't blend — it would overwrite the 3D scene)
            if (!_canvasConfigured) {
              _canvasConfigured = true
              const ctx = (renderer.backend as { context?: GPUCanvasContext } | undefined)?.context
              if (ctx) {
                ctx.configure({
                  device: dev,
                  format: navigator.gpu.getPreferredCanvasFormat(),
                  alphaMode: 'premultiplied',
                  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
                })
              }
            }
            const canvasTex = getCanvasTexture(renderer)
            if (canvasTex) {
              if (!_blitPipeline) _blitPipeline = new SkiaBlitPipeline(dev)
              _blitPipeline.blit(skiaTex, canvasTex, true /* alpha blend */)
            }
          } else if (this._renderTarget) {
            // Texture mode: blit Skia's output into the render target's texture
            // Use blit pipeline for format conversion (Skia=BGRA, RT=RGBA)
            const backend = renderer.backend as { get?: (t: unknown) => { texture?: GPUTexture } | undefined } | undefined
            if (backend?.get) {
              // Force Three.js to init the render target GPU resources
              const currentRT = renderer.getRenderTarget()
              renderer.setRenderTarget(this._renderTarget)
              renderer.setRenderTarget(currentRT)

              // Find the render target's GPUTexture
              const rt = this._renderTarget as unknown as Record<string, unknown>
              const tex = rt.texture ?? (rt.textures as unknown[])?.[0]
              const src = (tex as Record<string, unknown> | undefined)?.source
              let rtTex: GPUTexture | undefined
              for (const key of [src, tex, this._renderTarget].filter(Boolean)) {
                const props = backend.get(key!)
                if (props?.texture instanceof GPUTexture) {
                  rtTex = props.texture
                  break
                }
              }
              if (rtTex) {
                // Use blit pipeline — handles BGRA→RGBA format conversion
                if (!_blitPipeline) _blitPipeline = new SkiaBlitPipeline(dev)
                _blitPipeline.blit(skiaTex, rtTex, false /* opaque */, false /* no Y-flip for render targets */)
              }
            }
          }
        }
      }
    }


    this._needsRedraw = false
  }

  setSize(width: number, height: number): void {
    this._width = width
    this._height = height
    this._syncRenderTarget()
  }

  dispose(): void {
    this._renderTarget?.dispose()
    this._renderTarget = null
  }

  // ── Private: Skia context init ──

  private _initSkia(renderer: AnyRenderer): void {
    if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
      this._skiaContext = SkiaContext.instance
      this._resolveReady(this._skiaContext)
      this._syncRenderTarget()
      return
    }

    Skia.init(renderer).then((ctx) => {
      this._skiaContext = ctx
      this._resolveReady(ctx)
      this._syncRenderTarget()
    })
  }

  private _resolveReady(ctx: SkiaContext): void {
    if (this._readyResolve) {
      this._readyResolve(ctx)
      this._readyResolve = null
    }
  }

  // ── Private: render target management ──

  private _syncRenderTarget(): void {
    if (this._overlay || this._width <= 0 || this._height <= 0) {
      if (this._renderTarget) {
        this._renderTarget.dispose()
        this._renderTarget = null
      }
      return
    }

    if (this._renderTarget) {
      this._renderTarget.setSize(this._width, this._height)
    } else {
      this._renderTarget = new WebGLRenderTarget(this._width, this._height, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        type: UnsignedByteType,
        stencilBuffer: true,
      })
      // Skia outputs sRGB premultiplied alpha — tell Three.js so it doesn't double-gamma
      this._renderTarget.texture.colorSpace = SRGBColorSpace
      this._renderTarget.texture.premultiplyAlpha = true
    }
    this._needsRedraw = true
  }

  // ── Private: target handle resolution ──

  // Cached GL texture ID for texture mode
  private _glTexId = 0

  private _getTargetHandle(renderer: AnyRenderer): number {
    // WebGPU: Skia always owns its texture, we blit to destination after
    if (this._skiaContext!.backend === 'wgpu') return 0

    // WebGL overlay: render to default framebuffer (FBO 0)
    if (this._overlay) return 0

    // WebGL texture mode: try to get FBO handle from render target
    const fbo = this._getGLTargetHandle(renderer)
    if (fbo !== 0) return fbo

    // Fallback: use GL texture wrapping (see _beginDrawingToTexture)
    return -1 // sentinel: use texture mode
  }

  // Cache: GL objects → integer IDs in Skia's GL handle table
  private _glFBOHandles = new WeakMap<WebGLFramebuffer, number>()
  private _glTexHandles = new WeakMap<WebGLTexture, number>()

  /** Get Three.js's render target GL texture and register it in Skia's handle table */
  private _getOrRegisterGLTexture(renderer: AnyRenderer): number {
    if (this._glTexId > 0) return this._glTexId

    const gl = this._skiaContext?.gl
    const glState = this._skiaContext?._glState as { textures?: Map<number, WebGLTexture | null>; nextId: number } | undefined
    if (!gl || !glState?.textures || !this._renderTarget) return 0

    // Force Three.js to init the render target
    const currentRT = renderer.getRenderTarget()
    renderer.setRenderTarget(this._renderTarget)
    renderer.setRenderTarget(currentRT)

    // Extract the WebGLTexture from Three.js's backend
    const backend = renderer.backend as { get?: (t: unknown) => Record<string, unknown> | undefined } | undefined
    if (!backend?.get) return 0

    const rt = this._renderTarget as unknown as Record<string, unknown>
    const tex = rt.texture ?? (rt.textures as unknown[])?.[0]
    const src = (tex as Record<string, unknown> | undefined)?.source
    let glTexture: WebGLTexture | undefined
    for (const key of [src, tex, this._renderTarget].filter(Boolean)) {
      const data = backend.get(key!)
      if (data) {
        // Three.js WebGL backend stores the GL texture — check various key names
        for (const prop of Object.keys(data)) {
          if ((data as Record<string, unknown>)[prop] instanceof WebGLTexture) {
            glTexture = (data as Record<string, unknown>)[prop] as WebGLTexture
            break
          }
        }
        if (glTexture) break
      }
    }
    if (!glTexture) return 0

    // Check cache
    const cached = this._glTexHandles.get(glTexture)
    if (cached) { this._glTexId = cached; return cached }

    // Register in Skia's GL handle table
    const id = glState.nextId++
    glState.textures.set(id, glTexture)
    this._glTexHandles.set(glTexture, id)
    this._glTexId = id
    return id
  }

  private _getGLTargetHandle(renderer: AnyRenderer): number {
    // WebGLRenderer path — has `properties` object with numeric FBO IDs
    if (renderer.properties) {
      const currentTarget = renderer.getRenderTarget()
      renderer.setRenderTarget(this._renderTarget)
      renderer.setRenderTarget(currentTarget)
      return getFBOId(renderer, this._renderTarget!)
    }

    // WebGPURenderer in WebGL fallback: get the actual WebGLFramebuffer object
    // by asking Three.js to bind it, then register it in Skia's GL handle table
    const gl = this._skiaContext?.gl
    const glState = this._skiaContext?._glState
    if (!gl || !glState) return 0

    const currentTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this._renderTarget)
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    renderer.setRenderTarget(currentTarget)

    if (!fbo) {
      return 0
    }

    // Check cache first
    let id = this._glFBOHandles.get(fbo)
    if (id !== undefined) return id

    // Register Three.js's FBO in Skia's GL handle table so it can use the integer ID
    id = glState.nextId++
    glState.framebuffers.set(id, fbo)
    this._glFBOHandles.set(fbo, id)
    return id
  }

  // ── Private: scene graph walk ──

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
}
