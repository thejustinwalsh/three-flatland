import { createWasiImports } from './wasi-shim.js'

export interface BasisExports {
  memory: WebAssembly.Memory
  fl_basis_alloc: (bytes: number) => number
  fl_basis_free: (ptr: number) => void
  fl_basis_init: () => number
  fl_basis_encoder_create: () => number
  fl_basis_encoder_destroy: (enc: number) => void
  fl_basis_encode: (
    enc: number,
    rgba: number,
    w: number,
    h: number,
    opts: number,
    outPtr: number,
    outLen: number,
  ) => number
}

let modPromise: Promise<BasisExports> | null = null

export function __resetForTest(): void {
  modPromise = null
}

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

/**
 * Fetch the encoder wasm bytes from the bundler-resolved URL (browser) or
 * the package's libs/ directory (Node). The returned ArrayBuffer is owned
 * by the caller — transfer it to a worker via postMessage if you don't
 * need it on the main thread. Mirrors `fetchTranscoderBytes`.
 */
export async function fetchBasisBytes(): Promise<ArrayBuffer> {
  if (isNode()) {
    const [{ readFileSync }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ])
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/runtime/basis-loader.js -> ../../libs/basis/basis_encoder.wasm
    // src/runtime/basis-loader.ts (vitest) -> ../../libs/basis/basis_encoder.wasm
    const wasmPath = join(here, '../../libs/basis/basis_encoder.wasm')
    const buf = readFileSync(wasmPath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }
  // Browser: bundler (Vite/esbuild/webpack/rollup) resolves the asset URL.
  const url = new URL('../../libs/basis/basis_encoder.wasm', import.meta.url).href
  const res = await fetch(url)
  if (!res.ok) throw new Error(`basis_encoder.wasm fetch failed: ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Instantiate the wasm encoder from a byte buffer. Used by both the
 * inline (main-thread) path AND by the encoder worker after it receives
 * bytes via the init postMessage.
 */
export async function instantiateBasis(bytes: ArrayBuffer): Promise<BasisExports> {
  const memoryRef: { current: WebAssembly.Memory | null } = { current: null }
  const imports: WebAssembly.Imports = {
    wasi_snapshot_preview1: createWasiImports(() => {
      if (!memoryRef.current) throw new Error('memory not yet bound')
      return memoryRef.current
    }),
  }
  const result = await (WebAssembly.instantiate as (
    bytes: BufferSource,
    imports: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes, imports)
  const instance = result.instance
  const exports = instance.exports as unknown as BasisExports
  memoryRef.current = exports.memory
  // Reactor model: _initialize runs C++ global ctors before any fl_* call.
  const init = (instance.exports as unknown as { _initialize?: () => void })._initialize
  if (typeof init === 'function') init()
  const rc = exports.fl_basis_init()
  if (rc !== 0) throw new Error(`fl_basis_init failed: ${rc}`)
  return exports
}

/**
 * Convenience: fetch bytes + instantiate. Module-level cached for the
 * inline (main-thread) path. Worker callers should use
 * `instantiateBasis(bytes)` directly after receiving bytes via
 * postMessage init — never `loadBasisWasm()` (which would try to fetch
 * via `import.meta.url` against the blob URL the worker runs from).
 */
export function loadBasisWasm(): Promise<BasisExports> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    const bytes = await fetchBasisBytes()
    return instantiateBasis(bytes)
  })()
  return modPromise
}
