/**
 * Optional eager preloading of the Skia WASM module.
 * Call this early to overlap WASM compilation with other init work.
 */

let preloadedModule: Promise<WebAssembly.Module> | null = null

/**
 * Eagerly fetch and compile the Skia WASM module.
 * The compiled module is cached and reused by `SkiaContext.create()`.
 *
 * @param wasmUrl - URL to the skia-gl.wasm file
 */
export function preloadSkia(wasmUrl: string | URL): void {
  if (preloadedModule) return
  preloadedModule = WebAssembly.compileStreaming(fetch(wasmUrl.toString()))
}

/** @internal */
export function getPreloadedModule(): Promise<WebAssembly.Module> | null {
  return preloadedModule
}
