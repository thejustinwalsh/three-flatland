import decode, { init as initDecode } from '@jsquash/avif/decode'
import encode, { init as initEncode } from '@jsquash/avif/encode'

export interface AvifOptions {
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
    // @jsquash/avif ships separate decode + encode WASM modules.
    // Actual filenames: codec/dec/avif_dec.wasm and codec/enc/avif_enc.wasm
    // (avif_enc_mt.wasm is the multi-threaded variant; Node uses the single-threaded one)
    const decModule = await loadWasmFromDisk(
      '../../node_modules/@jsquash/avif/codec/dec/avif_dec.wasm',
    )
    const encModule = await loadWasmFromDisk(
      '../../node_modules/@jsquash/avif/codec/enc/avif_enc.wasm',
    )
    await initDecode(decModule)
    await initEncode(encModule)
  })()
  return wasmReady
}

export async function encodeAvif(image: ImageData, opts: AvifOptions = {}): Promise<Uint8Array> {
  await ensureWasm()
  const lossless = opts.mode === 'lossless'
  const buf = await encode(image, {
    quality: opts.quality ?? 50,
    qualityAlpha: -1,
    lossless,
    speed: 6,
  })
  return new Uint8Array(buf)
}

export async function decodeAvif(bytes: Uint8Array): Promise<ImageData> {
  await ensureWasm()
  const result = await decode(bytes as unknown as ArrayBuffer)
  if (!result) throw new Error('AVIF decode returned null')
  return result
}
