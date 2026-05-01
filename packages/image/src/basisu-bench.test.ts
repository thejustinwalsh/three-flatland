import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './codecs/png.js'
import { encodeKtx2 } from './codecs/ktx2.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PATH_B_THRESHOLD_MS = 5000

describe('BasisU latency benchmark', () => {
  it('encodes a 2048² atlas to ETC1S+mips and reports timing', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const t0 = performance.now()
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: true })
    const ms = performance.now() - t0
    process.stdout.write(`[basisu-bench] 2048² ETC1S+mips: ${ms.toFixed(0)}ms, ${(ktx2.length / 1024).toFixed(0)}KB\n`)
    expect(ktx2.length).toBeGreaterThan(0)
    if (ms > PATH_B_THRESHOLD_MS) {
      process.stdout.write(
        `[basisu-bench] WARN: stock encoder exceeded ${PATH_B_THRESHOLD_MS}ms threshold — TRIGGER PATH B (Zig-built SIMD).\n`,
      )
    }
  }, 120_000) // 120s timeout — generous; even slow path A should finish well within this
})
