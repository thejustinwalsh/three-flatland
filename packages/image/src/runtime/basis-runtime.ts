// URL-free runtime for the wasm Basis ENCODER.
//
// Counterpart to transcoder-runtime.ts: keeps `instantiateBasis` and
// the `BasisExports` type in a module that doesn't reference any
// asset URLs, so the basis-encoder-worker's import graph stays clean
// of `new URL(..., import.meta.url)` patterns that would trip Vite's
// worker-bundler warning.
//
// Main-thread callers should keep importing from `basis-loader.ts`,
// which re-exports these symbols and adds the URL-using helpers.

import { instantiateWithWasi } from './wasi-shim.js'

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

/**
 * Instantiate the wasm encoder from a byte buffer. Used by both the
 * inline (main-thread) path AND by the encoder worker after it
 * receives bytes via the init postMessage. The wasi-shim helper
 * runs `_initialize` (C++ global ctors) before returning.
 */
export async function instantiateBasis(bytes: ArrayBuffer): Promise<BasisExports> {
  const exports = await instantiateWithWasi<BasisExports>(bytes)
  const rc = exports.fl_basis_init()
  if (rc !== 0) throw new Error(`fl_basis_init failed: ${rc}`)
  return exports
}
