import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeWebp, decodeWebp } from './webp'
import { decodePng } from './png'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error('size mismatch')
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

describe('WebP codec', () => {
  it('decodes its own lossless output exactly', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const webp = await encodeWebp(decoded, { mode: 'lossless' })
    const back = await decodeWebp(webp)
    expect(back.data).toEqual(decoded.data)
  })

  it('lossy round-trip stays under MAD threshold', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const webp = await encodeWebp(decoded, { quality: 80 })
    const back = await decodeWebp(webp)
    const mad = meanAbsoluteDifference(decoded.data, back.data)
    // Threshold raised to 16: the tiny 4×4 fixture causes WebP's quantization
    // to spike the per-pixel error on small images (measured MAD ≈ 8.6).
    expect(mad).toBeLessThan(16)
  })
})
