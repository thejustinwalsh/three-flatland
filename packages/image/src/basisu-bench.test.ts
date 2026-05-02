import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './codecs/png.js'
import { encodeKtx2 } from './codecs/ktx2.js'
import { __resetForTest } from './runtime/basis-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PATH_B_THRESHOLD_MS = 5000

afterAll(() => {
  delete process.env.FL_BASIS_NO_SIMD
  __resetForTest()
})

describe('BasisU latency benchmark (Path B)', () => {
  it('encodes 2048² ETC1S+mips under 5s with SIMD; reports SIMD-on/off ratio', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))

    // Scalar (FL_BASIS_NO_SIMD=1): forces basisu::g_cpu_supports_sse41 = false,
    // routing all kernel call-sites through the scalar fallback in basisu_etc.cpp etc.
    process.env.FL_BASIS_NO_SIMD = '1'
    __resetForTest()
    const t0 = performance.now()
    const ktx2Scalar = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const scalarMs = performance.now() - t0

    // SIMD on (default).
    delete process.env.FL_BASIS_NO_SIMD
    __resetForTest()
    const t1 = performance.now()
    const ktx2Simd = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const simdMs = performance.now() - t1

    const ratio = scalarMs / simdMs
    process.stdout.write(
      `[basisu-bench] 2048² ETC1S+mips: SIMD=${simdMs.toFixed(0)}ms, scalar=${scalarMs.toFixed(0)}ms, speedup=${ratio.toFixed(2)}×, ${(ktx2Simd.length / 1024).toFixed(0)}KB\n`,
    )

    expect(ktx2Simd.length).toBeGreaterThan(0)
    // Both paths produce valid KTX2 with the same length (the SIMD-vs-scalar
    // byte-equivalence test gates exact identity on a 64×64 fixture; here we
    // just sanity-check the size matches).
    expect(ktx2Simd.length).toBe(ktx2Scalar.length)
    expect(simdMs).toBeLessThan(PATH_B_THRESHOLD_MS)
  }, 180_000)
})
