import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeAvif, decodeAvif } from './avif'
import { decodePng } from './png'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

function meanAbsoluteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error('size mismatch')
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
  return sum / a.length
}

describe('AVIF codec', () => {
  it('round-trips lossy stays under MAD threshold', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const avif = await encodeAvif(decoded, { quality: 55 })
    const back = await decodeAvif(avif)
    const mad = meanAbsoluteDifference(decoded.data, back.data)
    expect(mad).toBeLessThan(20)
  })
})
