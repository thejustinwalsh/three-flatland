import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeImage, decodeImage } from './index'
import { decodePng } from './codecs/png'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '__fixtures__/tiny.png'))

describe('encodeImage / decodeImage dispatch', () => {
  it('routes png to the PNG codec', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const out = await encodeImage(decoded, { format: 'png' })
    const back = await decodeImage(out, 'png')
    expect(back.data).toEqual(decoded.data)
  })

  it('routes webp to the WebP codec', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    const out = await encodeImage(decoded, { format: 'webp', mode: 'lossless' })
    const back = await decodeImage(out, 'webp')
    expect(back.width).toBe(decoded.width)
    expect(back.height).toBe(decoded.height)
  })

  it('throws for an unknown format', async () => {
    const decoded = await decodePng(new Uint8Array(fixture))
    await expect(encodeImage(decoded, { format: 'bogus' as never })).rejects.toThrow(/unknown format/i)
  })

  it('decodeImage rejects ktx2', async () => {
    await expect(decodeImage(new Uint8Array([0]), 'ktx2')).rejects.toThrow(/KTX2 decode/i)
  })
})
