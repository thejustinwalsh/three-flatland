import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng, decodePng } from './png'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))

describe('PNG codec', () => {
  it('decodes a fixture to RGBA8 ImageData', async () => {
    const img = await decodePng(new Uint8Array(fixture))
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
    expect(img.data.length).toBe(4 * 4 * 4)
  })

  it('round-trips RGBA8 bytes exactly', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const reencoded = await encodePng(decoded)
    const redecoded = await decodePng(reencoded)
    expect(redecoded.data).toEqual(decoded.data)
  })
})
