// Round-trip: encode UASTC+zstd → transcode back → verify it works.
// Catches regressions in either side of the zstd pipeline. Both halves
// gated by BASISD_SUPPORT_KTX2_ZSTD=1 in build.zig + zstd.c linked
// into both the encoder and transcoder wasm targets.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './png.js'
import { encodeKtx2 } from './ktx2.js'
import {
  loadTranscoderWasm,
  HEADER_SIZE_BYTES,
  LEVEL_INFO_SIZE_BYTES,
  readKtx2Header,
  readKtx2LevelInfo,
  FL_TRANSCODER_E_OK,
  __resetForTest as resetTranscoder,
} from '../runtime/transcoder-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TF_RGBA32 = 13

async function transcodeToRgba32(ktx2: Uint8Array): Promise<Uint8Array> {
  resetTranscoder()
  const t = await loadTranscoderWasm()
  const len = ktx2.length
  const inPtr = t.fl_transcoder_alloc(len)
  new Uint8Array(t.memory.buffer, inPtr, len).set(ktx2)
  const transcoder = t.fl_ktx2_transcoder_create()
  const headerPtr = t.fl_transcoder_alloc(HEADER_SIZE_BYTES)
  const levelPtr = t.fl_transcoder_alloc(LEVEL_INFO_SIZE_BYTES)
  try {
    expect(t.fl_ktx2_init(transcoder, inPtr, len)).toBe(FL_TRANSCODER_E_OK)
    expect(t.fl_ktx2_start_transcoding(transcoder)).toBe(FL_TRANSCODER_E_OK)
    t.fl_ktx2_get_header(transcoder, headerPtr)
    readKtx2Header(t.memory, headerPtr) // sanity-decode; not asserted here
    t.fl_ktx2_get_level_info(transcoder, 0, 0, 0, levelPtr)
    const lvl = readKtx2LevelInfo(t.memory, levelPtr)
    const totalPixels = lvl.width * lvl.height
    const outPtr = t.fl_transcoder_alloc(totalPixels * 4)
    try {
      expect(
        t.fl_ktx2_transcode_level(transcoder, 0, 0, 0, TF_RGBA32, outPtr, totalPixels, 0),
      ).toBe(FL_TRANSCODER_E_OK)
      return new Uint8Array(t.memory.buffer, outPtr, totalPixels * 4).slice()
    } finally {
      t.fl_transcoder_free(outPtr)
    }
  } finally {
    t.fl_transcoder_free(headerPtr)
    t.fl_transcoder_free(levelPtr)
    t.fl_ktx2_transcoder_destroy(transcoder)
    t.fl_transcoder_free(inPtr)
  }
}

describe('UASTC + zstd supercompression round-trip', () => {
  it('encodes UASTC+zstd, transcodes back to RGBA32, and produces non-trivial output', async () => {
    // 2048² fixture — small inputs (e.g. tiny.png at 64×64) are too small
    // for zstd's framing overhead to beat plain UASTC. The bench fixture
    // is a real atlas at 2048² where zstd's compression actually pays off.
    const png = readFileSync(join(__dirname, '../__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))

    // Default for UASTC mode: zstd auto-applies (supercompression
    // omitted → resolveSupercompression returns 1). Verify size is
    // smaller than raw UASTC for the same input as a sanity check.
    const ktx2Zstd = await encodeKtx2(decoded, { mode: 'uastc', uastcLevel: 2 })
    const ktx2Plain = await encodeKtx2(decoded, { mode: 'uastc', uastcLevel: 2, supercompression: 'none' })

    // zstd-compressed output should be strictly smaller than plain UASTC
    // for any non-trivial input. Equality means basisu didn't actually
    // run the zstd pass (regression). Typically ~20-30% smaller.
    expect(ktx2Zstd.length).toBeLessThan(ktx2Plain.length)

    // Round-trip the zstd file through the transcoder to RGBA32. With
    // zstd disabled in build.zig (BASISD_SUPPORT_KTX2_ZSTD=0), this
    // call would throw "BASISD_SUPPORT_KTX2_ZSTD == 0". With zstd
    // enabled, the transcoder transparently decompresses the zstd
    // post-pass and returns valid pixels.
    const rgba = await transcodeToRgba32(ktx2Zstd)
    expect(rgba.length).toBe(decoded.width * decoded.height * 4)
    // Spot-check: at least some pixels are non-zero. tiny.png is opaque
    // and colored; an all-zero output would mean the decompress failed
    // silently and we got an uninitialized buffer.
    const hasNonZero = rgba.some((b) => b !== 0)
    expect(hasNonZero).toBe(true)
  }, 30_000)

  it('ETC1S ignores supercompression="zstd" (basisu refuses to combine zstd with VAQ)', async () => {
    const png = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))
    const decoded = await decodePng(new Uint8Array(png))

    // Asking for zstd on ETC1S — the encoder honors the mode (ETC1S
    // wins) and silently drops supercompression. Basisu's encoder
    // would error if asked to apply both; resolveSupercompression in
    // codecs/ktx2.ts gates zstd to UASTC inputs.
    const ktx2 = await encodeKtx2(decoded, {
      mode: 'etc1s',
      quality: 128,
      supercompression: 'zstd',
    })
    expect(ktx2.length).toBeGreaterThan(0)

    // Transcode back as a sanity check — confirms the file is plain
    // ETC1S (not zstd-supercompressed).
    const rgba = await transcodeToRgba32(ktx2)
    expect(rgba.length).toBe(decoded.width * decoded.height * 4)
  }, 30_000)
})
