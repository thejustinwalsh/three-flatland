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
  __resetForTest()
})

describe('BasisU latency benchmark (Path B)', () => {
  it('encodes 2048² ETC1S+mips under 5s with SIMD', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))

    __resetForTest()
    const t0 = performance.now()
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const ms = performance.now() - t0

    process.stdout.write(`[basisu-bench] 2048² ETC1S+mips: ${ms.toFixed(0)}ms, ${(ktx2.length / 1024).toFixed(0)}KB\n`)

    // Correctness: the encode must produce a non-empty KTX2 everywhere.
    expect(ktx2.length).toBeGreaterThan(0)

    // The absolute-ms budget is useful only in an explicitly isolated local
    // run. Ordinary workspace tests execute projects concurrently, so host
    // contention can turn the same encode into a false regression. CI is also
    // too variable for an absolute wall-clock threshold. Keep correctness in
    // every run and opt into this machine-local gate when profiling Path B.
    if (process.env.FL_IMAGE_ABSOLUTE_PERF_GATE === '1') {
      expect(ms).toBeLessThan(PATH_B_THRESHOLD_MS)
    }
  }, 180_000)
})
