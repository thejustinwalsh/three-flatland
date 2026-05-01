import decode, { init as initDecode } from '@jsquash/webp/decode'
import encode, { init as initEncode } from '@jsquash/webp/encode'

export interface WebpOptions {
  quality?: number
  mode?: 'lossy' | 'lossless'
}

let wasmReady: Promise<void> | null = null

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

async function loadWasmFromDisk(relPath: string): Promise<WebAssembly.Module> {
  // Node-only path. The dynamic imports keep `node:*` out of browser bundles.
  const [{ readFileSync }, { join, dirname }, { fileURLToPath }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
    import('node:url'),
  ])
  const here = dirname(fileURLToPath(import.meta.url))
  const wasmPath = join(here, relPath)
  const bytes = readFileSync(wasmPath)
  return new WebAssembly.Module(bytes)
}

function ensureWasm(): Promise<void> {
  if (wasmReady) return wasmReady
  wasmReady = (async () => {
    if (!isNode()) return // browser: @jsquash's default init via fetch() works
    // @jsquash/webp ships separate decode + encode WASM modules.
    // Actual filenames: codec/dec/webp_dec.wasm and codec/enc/webp_enc.wasm
    const decModule = await loadWasmFromDisk(
      '../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm',
    )
    const encModule = await loadWasmFromDisk(
      '../../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm',
    )
    await initDecode(decModule)
    await initEncode(encModule)
  })()
  return wasmReady
}

export async function encodeWebp(image: ImageData, opts: WebpOptions = {}): Promise<Uint8Array> {
  await ensureWasm()
  const lossless = opts.mode === 'lossless'
  const buf = await encode(image, {
    quality: opts.quality ?? 80,
    lossless: lossless ? 1 : 0,
    method: 4,
  })
  return new Uint8Array(buf)
}

export async function decodeWebp(bytes: Uint8Array): Promise<ImageData> {
  await ensureWasm()
  return await decode(bytes as unknown as ArrayBuffer)
}
