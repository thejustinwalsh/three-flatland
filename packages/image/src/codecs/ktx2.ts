export interface Ktx2Options {
  mode?: 'etc1s' | 'uastc'
  quality?: number
  mipmaps?: boolean
  uastcLevel?: 0 | 1 | 2 | 3 | 4
}

interface BasisEncoderInstance {
  setSliceSourceImage: (slice: number, data: Uint8Array, w: number, h: number, isPng: boolean) => boolean
  setUASTC: (b: boolean) => void
  setMipGen: (b: boolean) => void
  setQualityLevel: (q: number) => void
  setPackUASTCFlags?: (f: number) => void
  setCreateKTX2File: (b: boolean) => void
  setKTX2UASTCSupercompression?: (b: boolean) => void
  setKTX2SRGBTransferFunc?: (b: boolean) => void
  setCheckForAlpha?: (b: boolean) => void
  setDebug?: (b: boolean) => void
  encode: (out: Uint8Array) => number
  delete: () => void
}

interface BasisModule {
  BasisEncoder: new () => BasisEncoderInstance
  initializeBasis: () => void
}

let modPromise: Promise<BasisModule> | null = null

function isNode(): boolean {
  return typeof process !== 'undefined' && process.release?.name === 'node'
}

async function loadEncoder(): Promise<BasisModule> {
  if (modPromise) return modPromise
  modPromise = (async () => {
    if (!isNode()) {
      throw new Error(
        'KTX2 encode in browser not yet wired (vendor/basis/basis_encoder.{js,wasm} must be served at runtime)',
      )
    }
    const [{ readFileSync }, { join, dirname }, { fileURLToPath }, { createRequire }] =
      await Promise.all([
        import('node:fs'),
        import('node:path'),
        import('node:url'),
        import('node:module'),
      ])
    const here = dirname(fileURLToPath(import.meta.url))
    // From dist/codecs/ktx2.js -> ../../vendor/basis/. From src/codecs/ktx2.ts (vitest) -> ../../vendor/basis/.
    const vendorDir = join(here, '../../vendor/basis')
    const jsPath = join(vendorDir, 'basis_encoder.js')
    const wasmPath = join(vendorDir, 'basis_encoder.wasm')
    // basis_encoder.js exports a CJS Emscripten factory: module.exports = function BASIS(opts) -> Promise<Module>
    const require = createRequire(import.meta.url)
    const factory = require(jsPath) as (cfg: {
      locateFile?: (p: string) => string
      wasmBinary?: Uint8Array
    }) => Promise<BasisModule>
    // Pass WASM bytes directly; avoids Emscripten's fetch/file-URL resolution.
    const wasmBinary = readFileSync(wasmPath)
    const mod = await factory({ wasmBinary })
    // initializeBasis() MUST be called before constructing BasisEncoder/BasisFile.
    mod.initializeBasis()
    return mod
  })()
  return modPromise
}

export async function encodeKtx2(image: ImageData, opts: Ktx2Options = {}): Promise<Uint8Array> {
  const mod = await loadEncoder()
  const enc = new mod.BasisEncoder()
  try {
    // Source: slice 0, raw RGBA8 (isPng=false because we pass already-decoded pixels).
    enc.setSliceSourceImage(
      0,
      new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
      image.width,
      image.height,
      false,
    )
    enc.setCreateKTX2File(true)
    enc.setUASTC(opts.mode === 'uastc')
    enc.setMipGen(!!opts.mipmaps)
    enc.setQualityLevel(opts.quality ?? 128)
    if (opts.uastcLevel !== undefined && enc.setPackUASTCFlags) {
      enc.setPackUASTCFlags(opts.uastcLevel)
    }
    if (enc.setCheckForAlpha) enc.setCheckForAlpha(true)
    // Pre-allocated output buffer: encoder requires byteLength >= written size.
    // 256KB is plenty for any reasonable fixture; KTX2 ETC1S of a 4x4 image is < 1KB.
    const outSize = Math.max(image.width * image.height * 4 + 4096, 256 * 1024)
    const out = new Uint8Array(outSize)
    const written = enc.encode(out)
    if (written === 0) {
      throw new Error(
        'basis_encoder returned 0 bytes - encode failed (check setSliceSourceImage args, isPng flag, and source dimensions)',
      )
    }
    return out.slice(0, written)
  } finally {
    enc.delete()
  }
}
