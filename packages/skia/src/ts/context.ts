import { type SkiaExports } from './types'
import { type SkiaWasmInstance, loadSkiaGL } from './wasm-loader'
import { getPreloadedModule } from './preload'
import { SkiaDrawingContext } from './drawing-context'

export interface SkiaContextOptions {
  /** URL to the skia-gl.wasm file */
  wasmUrl?: string | URL
}

/**
 * Main entry point for the Skia WASM API.
 *
 * Owns the WASM instance and GL context binding. Create resources
 * (SkiaPaint, SkiaPath, etc.) from this context.
 *
 * ```ts
 * const skia = await SkiaContext.create(gl)
 * skia.drawToFBO(0, 512, 512, (ctx) => {
 *   ctx.clear(0.1, 0.1, 0.2, 1)
 *   // ... draw
 * })
 * skia.destroy()
 * ```
 */
export class SkiaContext {
  /** The WebGL2 context this Skia instance targets */
  readonly gl: WebGL2RenderingContext

  /** @internal Raw WASM exports — used by resource classes */
  readonly _exports: SkiaExports

  /** @internal WASM linear memory — used for string/array passing */
  readonly _memory: WebAssembly.Memory

  private _destroyed = false
  private _drawing = false

  private constructor(gl: WebGL2RenderingContext, wasm: SkiaWasmInstance) {
    this.gl = gl
    this._exports = wasm.exports as unknown as SkiaExports
    this._memory = wasm.exports.memory as WebAssembly.Memory
  }

  /**
   * Create a new Skia context bound to a WebGL2 rendering context.
   *
   * @param gl - A WebGL2RenderingContext (user-provided, we don't create one)
   * @param options - Optional configuration
   */
  static async create(
    gl: WebGL2RenderingContext,
    options?: SkiaContextOptions,
  ): Promise<SkiaContext> {
    const wasmUrl = options?.wasmUrl ?? new URL('../dist/skia-gl/skia-gl.opt.wasm', import.meta.url)
    const wasm = await loadSkiaGL(wasmUrl, gl)
    const ctx = new SkiaContext(gl, wasm)
    ctx._exports.skia_init()
    return ctx
  }

  /**
   * Begin a draw pass targeting a specific framebuffer.
   *
   * @param fboId - WebGL framebuffer object ID (0 = default canvas FBO)
   * @param width - Surface width in pixels
   * @param height - Surface height in pixels
   * @returns A SkiaDrawingContext, or null if surface creation failed
   */
  beginDrawing(fboId: number, width: number, height: number): SkiaDrawingContext | null {
    if (this._destroyed) throw new Error('SkiaContext is destroyed')
    if (this._drawing) throw new Error('Already in a draw pass — call endDrawing() first')

    const result = this._exports.skia_begin_drawing(fboId, width, height)
    if (!result) return null

    this._drawing = true
    return new SkiaDrawingContext(this)
  }

  /**
   * End the current draw pass and flush to the framebuffer.
   */
  endDrawing(): void {
    if (!this._drawing) return
    this._exports.skia_end_drawing()
    this._drawing = false
  }

  /**
   * Draw to a framebuffer within a callback.
   * Automatically handles beginDrawing/endDrawing with try/finally.
   *
   * @param fboId - WebGL framebuffer object ID (0 = default canvas FBO)
   * @param width - Surface width in pixels
   * @param height - Surface height in pixels
   * @param callback - Drawing function receiving a SkiaDrawingContext
   * @returns true if drawing succeeded, false if surface creation failed
   */
  drawToFBO(
    fboId: number,
    width: number,
    height: number,
    callback: (ctx: SkiaDrawingContext) => void,
  ): boolean {
    const ctx = this.beginDrawing(fboId, width, height)
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

  /** Reset the GL state cache — call after Skia draws if sharing GL context */
  resetGLState(): void {
    if (!this._destroyed) this._exports.skia_reset_gl_state()
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
