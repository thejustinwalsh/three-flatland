import { decode, init as initDecode } from '@jsquash/png/decode'
import encode, { init as initEncode } from '@jsquash/png/encode'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

let wasmReady: Promise<void> | null = null

function ensureWasm(): Promise<void> {
  if (wasmReady) return wasmReady
  wasmReady = (async () => {
    // In Node (vitest), import.meta.url in the WASM loader points to a
    // transformed virtual path that fetch() cannot resolve.  Pre-load the
    // .wasm file from disk and compile it to a WebAssembly.Module, then
    // hand the same module to both init() helpers (they share the
    // squoosh_png.js singleton, so only one compile is actually needed).
    if (typeof process !== 'undefined' && process.release?.name === 'node') {
      const __dir = dirname(fileURLToPath(import.meta.url))
      const wasmPath = join(
        __dir,
        '../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
      )
      const wasmBytes = readFileSync(wasmPath)
      const wasmModule = new WebAssembly.Module(wasmBytes)
      await initDecode(wasmModule)
      await initEncode(wasmModule)
    }
  })()
  return wasmReady
}

export async function encodePng(image: ImageData): Promise<Uint8Array> {
  await ensureWasm()
  const buf = await encode(image)
  return new Uint8Array(buf)
}

export async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  await ensureWasm()
  return await decode(bytes as unknown as ArrayBuffer)
}
