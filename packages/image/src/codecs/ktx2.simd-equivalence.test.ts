import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { __resetForTest } from '../runtime/basis-loader.js'
import { encodeKtx2, type Ktx2Options } from './ktx2.js'

const W = 64, H = 64

let rgba: Uint8ClampedArray

beforeAll(() => {
  // Synthetic checker fixture — small, content-rich, deterministic.
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
})

afterAll(() => {
  // Leave the loader in a clean state for other tests.
  delete process.env.FL_BASIS_NO_SIMD
  __resetForTest()
})

async function encodeWith(opts: Ktx2Options, simd: boolean): Promise<Uint8Array> {
  if (simd) delete process.env.FL_BASIS_NO_SIMD
  else process.env.FL_BASIS_NO_SIMD = '1'
  __resetForTest()
  const image: ImageData = { width: W, height: H, data: rgba, colorSpace: 'srgb' } as ImageData
  return encodeKtx2(image, opts)
}

describe('Path B: SIMD vs scalar byte-equivalence', () => {
  it.each<[string, Ktx2Options]>([
    ['ETC1S q=128', { mode: 'etc1s', quality: 128, mipmaps: false }],
    ['UASTC level=2', { mode: 'uastc', uastcLevel: 2, mipmaps: false }],
  ])('produces byte-identical output for %s', async (_label, opts) => {
    const scalar = await encodeWith(opts, false)
    const simd = await encodeWith(opts, true)
    expect(scalar.length).toBeGreaterThan(0)
    expect(simd.length).toBe(scalar.length)
    expect(Buffer.from(simd).equals(Buffer.from(scalar))).toBe(true)
  }, 30_000)
})
