import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { __resetForTest } from '../runtime/basis-loader.js'
import { encodeKtx2 as encodeKtx2PathB, type Ktx2Options } from './ktx2.js'

const W = 64, H = 64

interface PathAEncoder {
  setSliceSourceImage: (slice: number, data: Uint8Array, w: number, h: number, isPng: boolean) => boolean
  setUASTC: (b: boolean) => void
  setMipGen: (b: boolean) => void
  setQualityLevel: (q: number) => void
  setPackUASTCFlags?: (f: number) => void
  setCreateKTX2File: (b: boolean) => void
  setCheckForAlpha?: (b: boolean) => void
  encode: (out: Uint8Array) => number
  delete: () => void
}

interface PathAModule {
  BasisEncoder: new () => PathAEncoder
  initializeBasis: () => void
}

let rgba: Uint8ClampedArray
let pathAMod: PathAModule

beforeAll(async () => {
  // Synthetic checker fixture (matches simd-equivalence test for cross-comparison).
  rgba = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const c = ((x >> 3) ^ (y >> 3)) & 1 ? 255 : 0
      rgba[i] = c
      rgba[i + 1] = 255 - c
      rgba[i + 2] = c
      rgba[i + 3] = 255
    }
  }
  // Path A loader: BinomialLLC factory + the preserved path-a.wasm.
  const here = dirname(fileURLToPath(import.meta.url))
  const vendorDir = join(here, '../../vendor/basis')
  const require = createRequire(import.meta.url)
  const factory = require(join(vendorDir, 'basis_encoder.js')) as (cfg: { wasmBinary: Uint8Array }) => Promise<PathAModule>
  const wasmBinary = readFileSync(join(vendorDir, 'basis_encoder.path-a.wasm'))
  pathAMod = await factory({ wasmBinary })
  pathAMod.initializeBasis()
})

afterAll(() => {
  __resetForTest()
})

function encodeKtx2PathA(opts: Ktx2Options): Uint8Array {
  const enc = new pathAMod.BasisEncoder()
  try {
    enc.setSliceSourceImage(0, new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), W, H, false)
    enc.setCreateKTX2File(true)
    enc.setUASTC(opts.mode === 'uastc')
    enc.setMipGen(!!opts.mipmaps)
    enc.setQualityLevel(opts.quality ?? 128)
    if (opts.uastcLevel !== undefined && enc.setPackUASTCFlags) {
      enc.setPackUASTCFlags(opts.uastcLevel)
    }
    if (enc.setCheckForAlpha) enc.setCheckForAlpha(true)
    // 256KB output buffer is plenty for a 64×64 fixture.
    const out = new Uint8Array(Math.max(W * H * 4 + 4096, 256 * 1024))
    const written = enc.encode(out)
    return out.slice(0, written)
  } finally {
    enc.delete()
  }
}

describe('Path A vs Path B byte-equivalence', () => {
  it.each<[string, Ktx2Options]>([
    ['ETC1S q=128', { mode: 'etc1s', quality: 128, mipmaps: false }],
  ])('Path A and Path B produce byte-identical KTX2 for %s', async (_label, opts) => {
    const a = encodeKtx2PathA(opts)
    // Reset Path B's loader so it picks up no env override.
    delete process.env.FL_BASIS_NO_SIMD
    __resetForTest()
    const image: ImageData = { width: W, height: H, data: rgba, colorSpace: 'srgb' } as ImageData
    const b = await encodeKtx2PathB(image, opts)
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBe(a.length)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  }, 30_000)
})
