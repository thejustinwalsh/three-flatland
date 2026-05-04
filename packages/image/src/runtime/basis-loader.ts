// Main-thread loader for the wasm Basis ENCODER. Uses
// `new URL(..., import.meta.url)` to resolve the wasm asset via the
// bundler. Workers MUST NOT import from this file — workers should
// import URL-free symbols (`instantiateBasis`, `BasisExports`) from
// `basis-runtime.ts` and feed them bytes received via postMessage init.

import { instantiateBasis, type BasisExports } from './basis-runtime.js'

// Re-export so existing main-thread callers keep working with the
// stable `basis-loader` import path.
export { instantiateBasis, type BasisExports } from './basis-runtime.js'

let modPromise: Promise<BasisExports> | null = null

export function __resetForTest(): void {
  modPromise = null
}

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

/**
 * Fetch the encoder wasm bytes from the bundler-resolved URL (browser)
 * or the package's libs/ directory (Node). Mirrors `fetchTranscoderBytes`.
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
 * Convenience: fetch bytes + instantiate. Module-level cached. Used by
 * the inline (main-thread) path. Worker callers MUST use
 * `instantiateBasis(bytes)` from `basis-runtime.ts` instead.
 */
export function loadBasisWasm(): Promise<BasisExports> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    const bytes = await fetchBasisBytes()
    return instantiateBasis(bytes)
  })()
  return modPromise
}
