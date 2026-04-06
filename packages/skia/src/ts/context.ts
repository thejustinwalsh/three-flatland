import type { SkiaExports } from './types'
import { SkiaDrawingContext } from './drawing-context'

export type SkiaBackend = 'webgl' | 'wgpu' | 'auto'

export interface SkiaContextOptions {
  /** Override URL to the WASM file */
  wasmUrl?: string | URL
  /** Backend preference: 'webgl', 'wgpu', or 'auto' (default) */
  backend?: SkiaBackend
}

/** @internal Options passed from init.ts after backend resolution */
export interface InternalCreateOptions extends SkiaContextOptions {
  backend: 'webgl' | 'wgpu'
  gl?: WebGL2RenderingContext
  device?: GPUDevice
  /** Pre-fetched Response from Skia.preload() — avoids a second fetch */
  preloadedResponse?: Promise<Response>
}

/** Module-level singleton — one SkiaContext per application */
let _instance: SkiaContext | null = null

/**
 * Main entry point for the Skia WASM API.
 *
 * Owns the WASM instance and GPU context binding. Create resources
 * (SkiaPaint, SkiaPath, etc.) from this context.
 *
 * Supports both WebGL (Ganesh) and WebGPU (Graphite/Dawn) backends.
 * The backend is determined at init time and cannot be changed.
 */
export class SkiaContext {
  /** Which GPU backend this context uses */
  readonly backend: 'webgl' | 'wgpu'

  /** The WebGL2 context (only set for webgl backend) */
  readonly gl?: WebGL2RenderingContext

  /** The GPUDevice (only set for wgpu backend) */
  readonly device?: GPUDevice

  /** @internal Raw WASM exports — used by resource classes */
  readonly _exports: SkiaExports

  /** @internal WASM linear memory — used for string/array passing */
  readonly _memory: WebAssembly.Memory

  private _destroyed = false
  private _drawing = false
  private _currentDrawCtx: SkiaDrawingContext | null = null

  /** @internal wgpu handle state for registerTexture */
  private _wgpuState?: { objects: Map<number, unknown>; nextHandle: number }

  private constructor(
    backend: 'webgl' | 'wgpu',
    exports: SkiaExports,
    memory: WebAssembly.Memory,
    gl?: WebGL2RenderingContext,
    device?: GPUDevice,
    wgpuState?: { objects: Map<number, unknown>; nextHandle: number },
  ) {
    this.backend = backend
    this.gl = gl
    this.device = device
    this._exports = exports
    this._memory = memory
    this._wgpuState = wgpuState
  }

  /** The singleton SkiaContext instance. Set by `create()`. */
  static get instance(): SkiaContext | null {
    return _instance
  }

  /**
   * Create a Skia context. Called by Skia.init() after backend resolution.
   *
   * Uses dynamic import() so that the unused loader is never loaded.
   * If you only ever init with WebGL, wasm-loader-wgpu.ts is never fetched.
   */
  static async create(options: InternalCreateOptions): Promise<SkiaContext> {
    if (options.backend === 'webgl') {
      const { loadSkiaGL } = await import('./wasm-loader-gl')
      const gl = options.gl!
      const wasmUrl = options.wasmUrl ?? new URL('../dist/skia-gl/skia-gl.wasm', import.meta.url)
      const wasm = await loadSkiaGL(wasmUrl, gl, options.preloadedResponse)
      const ctx = new SkiaContext(
        'webgl',
        wasm.exports as unknown as SkiaExports,
        wasm.exports.memory as WebAssembly.Memory,
        gl,
      )
      ctx._exports.skia_init()
      if (!_instance || _instance._destroyed) _instance = ctx
      return ctx
    } else {
      const { loadSkiaWGPU } = await import('./wasm-loader-wgpu')
      const device = options.device!
      const wasmUrl = options.wasmUrl ?? new URL('../dist/skia-wgpu/skia-wgpu.wasm', import.meta.url)
      const wasm = await loadSkiaWGPU(wasmUrl, device, options.preloadedResponse)
      const ctx = new SkiaContext(
        'wgpu',
        wasm.exports as unknown as SkiaExports,
        wasm.exports.memory as WebAssembly.Memory,
        undefined,
        device,
        wasm.wgpuState,
      )
      // Initialize Dawn context with device/queue handles
      ;(wasm.exports as Record<string, Function>).skia_init_with_handles(
        wasm.wgpuState.deviceHandle,
        wasm.wgpuState.queueHandle,
      )
      if (!_instance || _instance._destroyed) _instance = ctx
      return ctx
    }
  }

  /**
   * Register a GPUTexture and get a handle for use with beginDrawing().
   * Only available on the wgpu backend.
   */
  registerTexture(texture: GPUTexture): number {
    if (this.backend !== 'wgpu' || !this._wgpuState) {
      throw new Error('registerTexture() is only available on the wgpu backend')
    }
    const handle = this._wgpuState.nextHandle++
    this._wgpuState.objects.set(handle, texture)
    return handle
  }

  /**
   * Begin a draw pass targeting a specific framebuffer (GL) or texture (wgpu).
   *
   * @param targetHandle - WebGL FBO ID (webgl) or registered texture handle (wgpu)
   * @param width - Surface width in pixels
   * @param height - Surface height in pixels
   * @returns A SkiaDrawingContext, or null if surface creation failed
   */
  beginDrawing(targetHandle: number, width: number, height: number): SkiaDrawingContext | null {
    if (this._destroyed) throw new Error('SkiaContext is destroyed')
    if (this._drawing) throw new Error('Already in a draw pass — call endDrawing() first')

    const result = this._exports.skia_begin_drawing(targetHandle, width, height)
    if (!result) return null

    this._drawing = true
    this._currentDrawCtx = new SkiaDrawingContext(this)
    return this._currentDrawCtx
  }

  /** End the current draw pass and flush to the framebuffer/texture. */
  endDrawing(): void {
    if (!this._drawing) return
    this._exports.skia_end_drawing()
    this._currentDrawCtx?._invalidate()
    this._currentDrawCtx = null
    this._drawing = false
  }

  /**
   * Draw to a target within a callback.
   * Automatically handles beginDrawing/endDrawing with try/finally.
   */
  drawToFBO(
    targetHandle: number,
    width: number,
    height: number,
    callback: (ctx: SkiaDrawingContext) => void,
  ): boolean {
    const ctx = this.beginDrawing(targetHandle, width, height)
    if (!ctx) return false
    try {
      callback(ctx)
    } finally {
      this.endDrawing()
    }
    return true
  }

  /** Flush pending Skia GPU commands */
  flush(): void {
    if (!this._destroyed) this._exports.skia_flush()
  }

  /** Reset GPU state cache — call after Skia draws if sharing the GL context (no-op for wgpu) */
  resetState(): void {
    if (!this._destroyed) {
      this._exports.skia_reset_state()
    }
  }

  /** Destroy the Skia context and release all GPU resources */
  destroy(): void {
    if (this._destroyed) return
    if (this._drawing) this.endDrawing()
    this._exports.skia_destroy()
    this._destroyed = true
  }

  get isDestroyed(): boolean {
    return this._destroyed
  }

  // ── Memory helpers (used by resource classes) ──

  /** @internal Write a UTF-8 string to WASM memory. Returns [ptr, len]. */
  _writeString(str: string): [number, number] {
    const bytes = new TextEncoder().encode(str)
    const ptr = this._alloc(bytes.length)
    new Uint8Array(this._memory.buffer, ptr, bytes.length).set(bytes)
    return [ptr, bytes.length]
  }

  /** @internal Write a Uint8Array to WASM memory. Returns [ptr, len]. */
  _writeBytes(data: Uint8Array): [number, number] {
    const ptr = this._alloc(data.length)
    new Uint8Array(this._memory.buffer, ptr, data.length).set(data)
    return [ptr, data.length]
  }

  /** @internal Write a Float32Array to WASM memory. Returns ptr. */
  _writeF32(data: Float32Array | number[]): number {
    const arr = data instanceof Float32Array ? data : new Float32Array(data)
    const ptr = this._alloc(arr.byteLength)
    new Float32Array(this._memory.buffer, ptr, arr.length).set(arr)
    return ptr
  }

  /** @internal Write a Uint32Array to WASM memory. Returns ptr. */
  _writeU32(data: Uint32Array | number[]): number {
    const arr = data instanceof Uint32Array ? data : new Uint32Array(data)
    const ptr = this._alloc(arr.byteLength)
    new Uint32Array(this._memory.buffer, ptr, arr.length).set(arr)
    return ptr
  }

  /** @internal Allocate bytes in WASM linear memory via cabi_realloc (WIT canonical ABI) */
  private _alloc(size: number): number {
    return this._exports.cabi_realloc(0, 0, 1, size)
  }
}
