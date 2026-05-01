import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeKtx2 } from './ktx2'
import { decodePng } from './png'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

describe('KTX2/BasisU codec', () => {
  it('encodes a 4x4 RGBA fixture to a non-empty KTX2 container', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128 })
    expect(ktx2.length).toBeGreaterThan(64)
    // KTX2 magic: « K T X   2 0 » BE = AB 4B 54 58 20 32 30 BB BD 0A 1A 0A
    expect([ktx2[0], ktx2[1], ktx2[2]]).toEqual([0xab, 0x4b, 0x54])
  }, 30_000)
})
