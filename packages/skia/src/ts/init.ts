import { SkiaContext } from './context'
import type { SkiaContextOptions, SkiaBackend } from './context'

export type { SkiaBackend }

interface ResolvedBackend {
  backend: 'webgl' | 'wgpu'
  gl?: WebGL2RenderingContext
  device?: GPUDevice
}

/**
 * Detect the backend type from whatever the user passes in.
 * Accepts: WebGL2RenderingContext, GPUDevice, Three.js WebGLRenderer, or Three.js WebGPURenderer.
 *
 * In 'auto' mode:
 *   - If navigator.gpu doesn't exist → eagerly choose 'webgl' (100% certain, no WebGPU API)
 *   - If renderer.backend.device exists → 'wgpu' (Three.js got a real WebGPU device)
 *   - Otherwise → 'webgl' (Three.js fell back to WebGL despite browser having WebGPU)
 */
function resolveBackend(input: unknown, preference: SkiaBackend = 'auto'): ResolvedBackend {
  // ── Direct context/device inputs ──

  if (input instanceof WebGL2RenderingContext) {
    if (preference === 'wgpu') {
      throw new Error('Skia.init: cannot use WebGPU backend with a WebGL2 context')
    }
    return { backend: 'webgl', gl: input }
  }

  // GPUDevice (raw WebGPU device, no Three.js)
  if (input && typeof input === 'object' && 'createBuffer' in input && 'queue' in input) {
    if (preference === 'webgl') {
      throw new Error('Skia.init: cannot use WebGL backend with a GPUDevice')
    }
    return { backend: 'wgpu', device: input as GPUDevice }
  }

  // ── Three.js renderer inputs ──

  if (input && typeof input === 'object' && 'getContext' in input) {
    const renderer = input as { getContext: () => unknown; backend?: { device?: GPUDevice } }

    // Forced preference
    if (preference === 'wgpu') {
      if (!renderer.backend?.device) {
        throw new Error('Skia.init: backend "wgpu" requested but renderer has no GPUDevice (is it a WebGLRenderer?)')
      }
      return { backend: 'wgpu', device: renderer.backend.device }
    }

    if (preference === 'webgl') {
      const ctx = renderer.getContext()
      if (ctx instanceof WebGL2RenderingContext) {
        return { backend: 'webgl', gl: ctx }
      }
      // WebGPURenderer with native WebGPU — can't force WebGL on this renderer.
      // User should create a WebGLRenderer instead, or use WebGPURenderer({ forceWebGL: true }).
      throw new Error(
        'Skia.init: backend "webgl" requested but this renderer uses WebGPU natively. ' +
        'Use new WebGPURenderer({ forceWebGL: true }) or new WebGLRenderer() instead.'
      )
    }

    // Auto mode
    // Eager check: no WebGPU API → guaranteed WebGL
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      const ctx = renderer.getContext()
      if (ctx instanceof WebGL2RenderingContext) {
        return { backend: 'webgl', gl: ctx }
      }
      throw new Error('Skia.init: no WebGPU API and renderer.getContext() is not WebGL2')
    }

    // WebGPU API exists — check what Three.js actually got
    if (renderer.backend?.device) {
      return { backend: 'wgpu', device: renderer.backend.device }
    }

    // Three.js fell back to WebGL despite browser having WebGPU API
    const ctx = renderer.getContext()
    if (ctx instanceof WebGL2RenderingContext) {
      return { backend: 'webgl', gl: ctx }
    }

    throw new Error('Skia.init: renderer.getContext() returned neither WebGL2 nor WebGPU device')
  }

  throw new Error(
    'Skia.init: expected a WebGL2RenderingContext, GPUDevice, or a Three.js Renderer. ' +
    'Pass your renderer instance or raw graphics context.'
  )
}

// ── Preload state ──

let _preloadBackend: 'webgl' | 'wgpu' | null = null
let _preloadResponse: Promise<Response> | null = null

/**
 * Determine which backend to use based on preference and browser capabilities.
 * Returns null if we can't determine yet (auto mode with WebGPU API present).
 */
function resolvePreloadBackend(backend: SkiaBackend): 'webgl' | 'wgpu' | null {
  if (backend === 'webgl') return 'webgl'
  if (backend === 'wgpu') return 'wgpu'
  // Auto: if no WebGPU API, definitely WebGL
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'webgl'
  // WebGPU API exists — can't decide until renderer tells us
  return null
}

function getWasmUrl(backend: 'webgl' | 'wgpu'): URL {
  return backend === 'webgl'
    ? new URL('../../dist/skia-gl/skia-gl.wasm', import.meta.url)
    : new URL('../../dist/skia-wgpu/skia-wgpu.wasm', import.meta.url)
}

/**
 * Initialize Skia. Call once with your graphics context or Three.js renderer.
 *
 * Detects the backend (WebGL vs WebGPU), loads the correct WASM module,
 * and creates the singleton SkiaContext.
 *
 * ```ts
 * // Auto-detect from Three.js renderer (recommended)
 * const skia = await Skia.init(renderer)
 *
 * // Force a specific backend
 * const skia = await Skia.init(renderer, { backend: 'webgl' })
 * const skia = await Skia.init(renderer, { backend: 'wgpu' })
 *
 * // With a raw WebGL2 context
 * const skia = await Skia.init(canvas.getContext('webgl2'))
 *
 * // With a raw GPUDevice
 * const skia = await Skia.init(gpuDevice)
 * ```
 */
async function init(
  input: WebGL2RenderingContext | GPUDevice | unknown,
  options?: SkiaContextOptions,
): Promise<SkiaContext> {
  // Return existing if already initialized and not destroyed
  if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
    return SkiaContext.instance
  }

  const resolved = resolveBackend(input, options?.backend)

  // If preload started the right fetch, pass it through to avoid a second fetch
  const preloadedResponse =
    _preloadResponse && _preloadBackend === resolved.backend
      ? _preloadResponse
      : undefined

  if (resolved.backend === 'webgl') {
    return SkiaContext.create({ ...options, backend: 'webgl', gl: resolved.gl!, preloadedResponse })
  } else {
    return SkiaContext.create({ ...options, backend: 'wgpu', device: resolved.device!, preloadedResponse })
  }
}

/**
 * Start fetching the WASM binary early, before the renderer is created.
 *
 * The fetched Response is cached and reused by `Skia.init()`, avoiding a
 * redundant network request.
 *
 * In 'auto' mode, uses a synchronous `navigator.gpu` check:
 *   - No WebGPU API → starts fetching skia-gl.wasm immediately
 *   - WebGPU API exists → defers until init() knows which backend Three.js got
 *
 * You can force a specific backend to start fetching immediately:
 *   - `Skia.preload('webgl')` — always fetches GL (e.g., if you know you'll force WebGL)
 *   - `Skia.preload('wgpu')` — always fetches WebGPU
 *
 * @param backend - 'auto' (default), 'webgl', or 'wgpu'
 * @returns true if preload started, false if deferred (auto + WebGPU API exists)
 */
function preload(backend: SkiaBackend = 'auto'): boolean {
  if (_preloadResponse) return true

  const resolved = resolvePreloadBackend(backend)
  if (!resolved) return false

  _preloadBackend = resolved
  _preloadResponse = fetch(getWasmUrl(resolved))
  return true
}

/**
 * Skia entry point. Call `Skia.init(renderer)` to get started.
 */
export const Skia = {
  init,
  preload,

  /** The current SkiaContext singleton, or null if not yet initialized */
  get context(): SkiaContext | null {
    return SkiaContext.instance
  },
} as const
