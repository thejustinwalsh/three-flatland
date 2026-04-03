import { SkiaContext } from './context'
import type { SkiaContextOptions } from './context'

type Backend = 'webgl' | 'webgpu'

/**
 * Detect the backend type from whatever the user passes in.
 * Accepts: WebGL2RenderingContext, Three.js WebGLRenderer, or Three.js WebGPURenderer.
 */
function resolveBackend(input: unknown): { gl: WebGL2RenderingContext; backend: Backend } {
  // Raw WebGL2 context
  if (input instanceof WebGL2RenderingContext) {
    return { gl: input, backend: 'webgl' }
  }

  // Three.js renderer — has getContext()
  if (input && typeof input === 'object' && 'getContext' in input) {
    const renderer = input as { getContext: () => unknown; backend?: { device?: unknown } }
    const ctx = renderer.getContext()

    // WebGPU renderer — has renderer.backend.device
    if (renderer.backend?.device) {
      // Phase 6: return { gl: ctx, backend: 'webgpu' }
      throw new Error('Skia WebGPU backend is not yet implemented. Use a WebGL renderer.')
    }

    // WebGL renderer
    if (ctx instanceof WebGL2RenderingContext) {
      return { gl: ctx, backend: 'webgl' }
    }

    throw new Error('Skia.init: renderer.getContext() did not return a WebGL2RenderingContext')
  }

  throw new Error(
    'Skia.init: expected a WebGL2RenderingContext or a Three.js Renderer. ' +
    'Pass canvas.getContext("webgl2") or your Three.js renderer instance.'
  )
}

/**
 * Initialize Skia. Call once with your GL context or Three.js renderer.
 *
 * Detects the backend (WebGL vs WebGPU), loads the correct WASM module,
 * and creates the singleton SkiaContext. Everything else (loaders, drawing,
 * SkiaCanvas) uses this context automatically.
 *
 * ```ts
 * // With a raw WebGL2 context
 * const skia = await Skia.init(canvas.getContext('webgl2'))
 *
 * // With a Three.js renderer
 * const skia = await Skia.init(renderer)
 *
 * // Now everything works — loaders, drawing, SkiaCanvas
 * const font = await SkiaFontLoader.load('/fonts/Inter.ttf')
 * ```
 *
 * @param backend - A WebGL2RenderingContext, Three.js WebGLRenderer, or WebGPURenderer
 * @param options - Optional: wasmUrl override
 * @returns The SkiaContext singleton
 */
async function init(
  backend: WebGL2RenderingContext | unknown,
  options?: SkiaContextOptions,
): Promise<SkiaContext> {
  // Return existing if already initialized and not destroyed
  if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
    return SkiaContext.instance
  }

  const { gl, backend: type } = resolveBackend(backend)

  // Phase 6: select WASM URL based on backend type
  // For now, only WebGL is supported
  if (type === 'webgpu') {
    throw new Error('Skia WebGPU backend is not yet implemented')
  }

  return SkiaContext.create(gl, options)
}

/**
 * Skia entry point. Call `Skia.init(renderer)` to get started.
 */
export const Skia = {
  init,

  /** The current SkiaContext singleton, or null if not yet initialized */
  get context(): SkiaContext | null {
    return SkiaContext.instance
  },
} as const
