import { decode, init as initDecode } from '@jsquash/png/decode.js'
import encode, { init as initEncode } from '@jsquash/png/encode.js'

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
    const wasmModule = await loadWasmFromDisk(
      '../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
    )
    await initDecode(wasmModule)
    await initEncode(wasmModule)
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
