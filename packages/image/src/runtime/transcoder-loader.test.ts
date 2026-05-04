// T5 sanity test: load the transcoder wasm, ingest a KTX2 file we just
// encoded, verify start_transcoding succeeds, query header/level info,
// and transcode the base mip into RGBA32. Round-trips against our own
// encoder; T8 will do the cross-implementation equivalence check against
// three's transcoder.

import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from '../codecs/png.js'
import { encodeKtx2 } from '../codecs/ktx2.js'
import {
  loadTranscoderWasm,
  readKtx2Header,
  readKtx2LevelInfo,
  HEADER_SIZE_BYTES,
  LEVEL_INFO_SIZE_BYTES,
  FL_TRANSCODER_E_OK,
  __resetForTest as resetTranscoder,
} from './transcoder-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// basist::transcoder_texture_format::cTFRGBA32 — uncompressed RGBA8, used
// here because it's renderer-agnostic and easy to spot-check.
const TF_RGBA32 = 13

afterAll(() => {
  resetTranscoder()
})

describe('transcoder-loader', () => {
  it('loads, parses, and transcodes a KTX2 file we just encoded', async () => {
    // Encode tiny.png to KTX2 (ETC1S, no mipmaps, RGBA8).
    const png = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: false })
    expect(ktx2.length).toBeGreaterThan(0)

    // Load the transcoder wasm.
    const t = await loadTranscoderWasm()
    const memory = t.memory

    // Allocate two buffers in wasm memory: one for the KTX2 input, one for
    // the header struct output. The transcoder reads the input on demand
    // during transcode, so the buffer must stay live until destroy.
    const inputPtr = t.fl_transcoder_alloc(ktx2.length)
    expect(inputPtr).not.toBe(0)
    new Uint8Array(memory.buffer, inputPtr, ktx2.length).set(ktx2)

    const transcoder = t.fl_ktx2_transcoder_create()
    expect(transcoder).not.toBe(0)

    try {
      // Ingest container.
      let rc = t.fl_ktx2_init(transcoder, inputPtr, ktx2.length)
      expect(rc).toBe(FL_TRANSCODER_E_OK)

      // Pre-transcode (decompresses ETC1S codebooks).
      rc = t.fl_ktx2_start_transcoding(transcoder)
      expect(rc).toBe(FL_TRANSCODER_E_OK)

      // Header.
      const headerPtr = t.fl_transcoder_alloc(HEADER_SIZE_BYTES)
      rc = t.fl_ktx2_get_header(transcoder, headerPtr)
      expect(rc).toBe(FL_TRANSCODER_E_OK)
      const header = readKtx2Header(memory, headerPtr)
      t.fl_transcoder_free(headerPtr)

      expect(header.pixelWidth).toBe(decoded.width)
      expect(header.pixelHeight).toBe(decoded.height)
      expect(header.levelCount).toBe(1) // mipmaps: false
      expect(header.faceCount).toBe(1)  // 2D
      expect(header.isEtc1s).toBe(true)
      expect(header.isUastc).toBe(false)
      expect(header.isHdr).toBe(false)

      // Per-level info for level 0.
      const levelPtr = t.fl_transcoder_alloc(LEVEL_INFO_SIZE_BYTES)
      rc = t.fl_ktx2_get_level_info(transcoder, 0, 0, 0, levelPtr)
      expect(rc).toBe(FL_TRANSCODER_E_OK)
      const level = readKtx2LevelInfo(memory, levelPtr)
      t.fl_transcoder_free(levelPtr)

      expect(level.width).toBeGreaterThanOrEqual(decoded.width)
      expect(level.height).toBeGreaterThanOrEqual(decoded.height)
      expect(level.blockWidth).toBe(4)  // ETC1S block size
      expect(level.blockHeight).toBe(4)

      // Transcode base mip into RGBA32. cTFRGBA32 sizes by PIXELS.
      const totalPixels = level.width * level.height
      const bytesPerPixel = t.fl_basis_get_bytes_per_block_or_pixel(TF_RGBA32)
      expect(bytesPerPixel).toBe(4)

      const outPtr = t.fl_transcoder_alloc(totalPixels * bytesPerPixel)
      rc = t.fl_ktx2_transcode_level(
        transcoder,
        0, 0, 0,
        TF_RGBA32,
        outPtr, totalPixels,
        0, // decode_flags
      )
      expect(rc).toBe(FL_TRANSCODER_E_OK)

      // Spot-check the output: at least one non-zero pixel, alpha channel
      // 0xFF where the source had alpha 0xFF. We're not checking color
      // fidelity (ETC1S is lossy; T8 does fixture-based equivalence).
      const out = new Uint8Array(memory.buffer, outPtr, totalPixels * 4)
      const hasNonZero = out.some((b) => b !== 0)
      expect(hasNonZero).toBe(true)
      // tiny.png is fully opaque; all alphas should be 0xFF after transcode.
      for (let i = 3; i < out.length; i += 4) {
        expect(out[i]).toBe(0xff)
      }
      t.fl_transcoder_free(outPtr)
    } finally {
      t.fl_ktx2_transcoder_destroy(transcoder)
      t.fl_transcoder_free(inputPtr)
    }
  }, 30_000)

  it('format query helpers return correct values', async () => {
    const t = await loadTranscoderWasm()

    // cTFRGBA32 is uncompressed, has alpha, 4 bytes/pixel
    expect(t.fl_basis_format_is_uncompressed(TF_RGBA32)).toBe(1)
    expect(t.fl_basis_format_has_alpha(TF_RGBA32)).toBe(1)
    expect(t.fl_basis_get_bytes_per_block_or_pixel(TF_RGBA32)).toBe(4)
    expect(t.fl_basis_format_is_hdr(TF_RGBA32)).toBe(0)

    // cTFETC1_RGB = 0 — block-compressed, no alpha, 8 bytes/block
    expect(t.fl_basis_format_is_uncompressed(0)).toBe(0)
    expect(t.fl_basis_format_has_alpha(0)).toBe(0)
    expect(t.fl_basis_get_bytes_per_block_or_pixel(0)).toBe(8)

    // cTFETC2_RGBA = 1 — block-compressed, has alpha, 16 bytes/block
    expect(t.fl_basis_format_is_uncompressed(1)).toBe(0)
    expect(t.fl_basis_format_has_alpha(1)).toBe(1)
    expect(t.fl_basis_get_bytes_per_block_or_pixel(1)).toBe(16)
  })
})
