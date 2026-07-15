// Smoke test for the rewritten Ktx2Loader. Runs the inline (no-Worker)
// path under Node since vitest doesn't expose a browser Worker. T7
// integration in the actual VSCode webview validates the worker code path.

import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataTexture, RGBAFormat } from 'three'
import { decodePng } from '../codecs/png.js'
import { encodeKtx2 } from '../codecs/ktx2.js'
import { __resetForTest as resetTranscoder } from '../runtime/transcoder-loader.js'
import { Ktx2Loader, type Ktx2Capabilities } from './Ktx2Loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// All-false capabilities forces the uncompressed RGBA32 fallback target.
const NO_GPU_CAPS: Ktx2Capabilities = {
  astcSupported: false,
  astcHDRSupported: false,
  etc1Supported: false,
  etc2Supported: false,
  dxtSupported: false,
  bptcSupported: false,
  pvrtcSupported: false,
}

afterAll(() => {
  resetTranscoder()
})

describe('Ktx2Loader (Node fallback path)', () => {
  it('parses a Basis-encoded KTX2 buffer into a DataTexture (RGBA32 fallback)', async () => {
    const png = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: false })

    const loader = new Ktx2Loader().setSupportedFormats(NO_GPU_CAPS)

    // ArrayBuffer.from a Uint8Array slice (parse expects an ArrayBuffer).
    const buf = ktx2.buffer.slice(ktx2.byteOffset, ktx2.byteOffset + ktx2.byteLength) as ArrayBuffer
    const texture = await loader.parse(buf)

    // No-caps fallback transcodes to RGBA32 → DataTexture (uncompressed
    // upload path). Wrapping uncompressed RGBA in CompressedTexture stalls
    // three's WebGPU upload — see buildTexture for rationale.
    expect(texture).toBeInstanceOf(DataTexture)
    expect((texture as DataTexture).image.width).toBeGreaterThanOrEqual(decoded.width)
    expect((texture as DataTexture).image.height).toBeGreaterThanOrEqual(decoded.height)
    expect(texture.format).toBe(RGBAFormat)
    // texture.needsUpdate is a write-only setter in three; can't read back.
    expect(texture.mipmaps?.length).toBe(1)

    loader.dispose()
  }, 30_000)

  it('rejects when caps not configured', async () => {
    const loader = new Ktx2Loader()
    const dummy = new ArrayBuffer(4)
    await expect(loader.parse(dummy)).rejects.toThrow(/setSupportedFormats/)
  })
})
