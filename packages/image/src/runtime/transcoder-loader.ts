// Main-thread loader for the wasm KTX2 transcoder. Uses
// `new URL(..., import.meta.url)` to resolve the wasm asset via the
// bundler. Workers MUST NOT import from this file — the asset URL
// pattern can't resolve inside a `?worker&inline` blob URL Worker, and
// importing it triggers a `[vite:worker] "to" undefined` warning at
// build time. Workers should import URL-free symbols (types,
// instantiateTranscoder, readers, etc.) from `transcoder-runtime.ts`.

import { instantiateTranscoder, type TranscoderExports } from './transcoder-runtime.js'

// Re-exports so existing main-thread callers keep working with the
// stable `transcoder-loader` import path.
export {
  instantiateTranscoder,
  readKtx2Header,
  readKtx2LevelInfo,
  HEADER_OFFSETS,
  HEADER_SIZE_BYTES,
  LEVEL_INFO_OFFSETS,
  LEVEL_INFO_SIZE_BYTES,
  FL_TRANSCODER_E_OK,
  FL_TRANSCODER_E_BAD_INPUT,
  FL_TRANSCODER_E_NO_INIT,
  FL_TRANSCODER_E_INIT_FAIL,
  FL_TRANSCODER_E_NOT_STARTED,
  FL_TRANSCODER_E_START_FAIL,
  FL_TRANSCODER_E_LEVEL_INFO_FAIL,
  FL_TRANSCODER_E_TRANSCODE_FAIL,
  type TranscoderExports,
  type Ktx2Header,
  type Ktx2LevelInfo,
} from './transcoder-runtime.js'

let modPromise: Promise<TranscoderExports> | null = null

export function __resetForTest(): void {
  modPromise = null
}

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

/**
 * Fetch the wasm bytes from the bundler-resolved URL (browser) or the
 * package's libs/ directory (Node). The returned ArrayBuffer is owned
 * by the caller — transfer it to a worker via postMessage if you don't
 * need it on the main thread.
 */
export async function fetchTranscoderBytes(): Promise<ArrayBuffer> {
  if (isNode()) {
    const [{ readFileSync }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ])
    const here = dirname(fileURLToPath(import.meta.url))
    // dist/runtime/transcoder-loader.js -> ../../libs/basis/basis_transcoder.wasm
    // src/runtime/transcoder-loader.ts (vitest) -> ../../libs/basis/basis_transcoder.wasm
    const wasmPath = join(here, '../../libs/basis/basis_transcoder.wasm')
    const buf = readFileSync(wasmPath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }
  // Browser: bundler (Vite/esbuild/webpack/rollup) resolves the asset URL.
  const url = new URL('../../libs/basis/basis_transcoder.wasm', import.meta.url).href
  const res = await fetch(url)
  if (!res.ok) throw new Error(`basis_transcoder.wasm fetch failed: ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Convenience: fetch bytes + instantiate. Module-level cached. Used by
 * the main-thread inline path (`Ktx2Loader.parse()` fallback when
 * Worker is unavailable). Worker callers MUST instead import
 * `instantiateTranscoder` from `transcoder-runtime.ts` and feed it
 * bytes received via postMessage init.
 */
export function loadTranscoderWasm(): Promise<TranscoderExports> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    const bytes = await fetchTranscoderBytes()
    return instantiateTranscoder(bytes)
  })()
  return modPromise
}
