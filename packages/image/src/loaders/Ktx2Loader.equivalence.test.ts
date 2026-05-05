// T8 — Equivalence test: our owned wasm transcoder vs three.js's vendored
// basis_transcoder.{js,wasm}. Asserts byte-equal RGBA32 output for the same
// KTX2 input.
//
// Skipped by default. Run when:
//  - basisu vendor sources are bumped in vendor/basisu/
//  - the basis_transcoder C API or zig build flags change
//  - we suspect a regression in our wasm output
//
// To run: change `describe.skip` to `describe.only`, then:
//   pnpm vitest run packages/image/src/loaders/Ktx2Loader.equivalence.test.ts
//
// Why byte-equality on the TRANSCODED output (not on the wasm itself):
// our zig+wasm32-wasi build produces different binary bytes than three's
// emscripten build, which is fine — what matters is that the algorithm
// produces identical pixels. Both transcoders wrap the same upstream
// basisu_transcoder.cpp; if the algorithms diverge, our build is wrong.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from '../codecs/png.js'
import { encodeKtx2 } from '../codecs/ktx2.js'
import {
  loadTranscoderWasm,
  HEADER_SIZE_BYTES,
  LEVEL_INFO_SIZE_BYTES,
  readKtx2Header,
  readKtx2LevelInfo,
  FL_TRANSCODER_E_OK,
  __resetForTest,
} from '../runtime/transcoder-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// basist::transcoder_texture_format::cTFRGBA32 — uncompressed RGBA8.
const TF_RGBA32 = 13

interface ThreeKtx2File {
  isValid(): boolean
  startTranscoding(): boolean
  getImageLevelInfo(mip: number, layer: number, face: number): { width: number; height: number; origWidth: number; origHeight: number }
  getImageTranscodedSizeInBytes(mip: number, layer: number, face: number, fmt: number): number
  transcodeImage(
    dst: Uint8Array,
    mip: number,
    layer: number,
    face: number,
    fmt: number,
    decodeFlags: number,
    channel0: number,
    channel1: number,
  ): boolean
  close(): void
  delete(): void
}

interface ThreeBasisModule {
  initializeBasis(): void
  KTX2File: new (bytes: Uint8Array) => ThreeKtx2File
}

describe.skip('transcoder equivalence — ours vs three.js', () => {
  it('produces byte-identical RGBA32 output for an ETC1S KTX2 fixture', async () => {
    // Encode a fixture KTX2 from a known PNG. Use ETC1S (most-used Basis
    // mode in practice). Mipmaps disabled to keep the comparison
    // single-level — iterating over mips would just multiply the
    // assertion surface without testing anything new.
    const png = readFileSync(join(__dirname, '../__fixtures__/tiny.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: false })

    const ours = await transcodeViaOurs(ktx2)
    const theirs = await transcodeViaThree(ktx2)

    expect(ours.length).toBe(theirs.length)
    expect(Buffer.from(ours).equals(Buffer.from(theirs))).toBe(true)
  })
})

async function transcodeViaOurs(ktx2: Uint8Array): Promise<Uint8Array> {
  __resetForTest()
  const t = await loadTranscoderWasm()
  const len = ktx2.length
  const inPtr = t.fl_transcoder_alloc(len)
  new Uint8Array(t.memory.buffer, inPtr, len).set(ktx2)
  const transcoder = t.fl_ktx2_transcoder_create()
  if (transcoder === 0) throw new Error('ours: ktx2_transcoder_create returned null')

  const headerPtr = t.fl_transcoder_alloc(HEADER_SIZE_BYTES)
  const levelPtr = t.fl_transcoder_alloc(LEVEL_INFO_SIZE_BYTES)
  try {
    if (t.fl_ktx2_init(transcoder, inPtr, len) !== FL_TRANSCODER_E_OK) {
      throw new Error('ours: fl_ktx2_init failed')
    }
    if (t.fl_ktx2_start_transcoding(transcoder) !== FL_TRANSCODER_E_OK) {
      throw new Error('ours: fl_ktx2_start_transcoding failed')
    }

    t.fl_ktx2_get_header(transcoder, headerPtr)
    readKtx2Header(t.memory, headerPtr) // sanity-decode; not asserted here

    t.fl_ktx2_get_level_info(transcoder, 0, 0, 0, levelPtr)
    const lvl = readKtx2LevelInfo(t.memory, levelPtr)

    const totalPixels = lvl.width * lvl.height
    const outPtr = t.fl_transcoder_alloc(totalPixels * 4)
    try {
      const rc = t.fl_ktx2_transcode_level(
        transcoder,
        0, 0, 0,
        TF_RGBA32,
        outPtr, totalPixels,
        0, // decode_flags
      )
      if (rc !== FL_TRANSCODER_E_OK) throw new Error(`ours: transcode_level rc=${rc}`)
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

async function transcodeViaThree(ktx2: Uint8Array): Promise<Uint8Array> {
  // basis_transcoder.js is an emscripten module. Its Node branch
  // (`ENVIRONMENT_IS_NODE`) uses `require('fs')`/`require('path')` —
  // resolve via createRequire so it runs in vitest's ESM environment.
  const require = createRequire(import.meta.url)
  const basisJsPath = require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js')
  const factory = require(basisJsPath) as (opts?: { wasmBinary?: ArrayBuffer }) => Promise<ThreeBasisModule>
  const wasmBinary = readFileSync(basisJsPath.replace(/\.js$/, '.wasm'))
  const Module = await factory({ wasmBinary: wasmBinary.buffer.slice(0) })
  Module.initializeBasis()

  const ktx2File = new Module.KTX2File(ktx2)
  try {
    if (!ktx2File.isValid()) throw new Error('three: KTX2 invalid')
    if (!ktx2File.startTranscoding()) throw new Error('three: startTranscoding failed')
    const lvl = ktx2File.getImageLevelInfo(0, 0, 0)
    const dstSize = ktx2File.getImageTranscodedSizeInBytes(0, 0, 0, TF_RGBA32)
    const dst = new Uint8Array(dstSize)
    if (!ktx2File.transcodeImage(dst, 0, 0, 0, TF_RGBA32, 0, -1, -1)) {
      throw new Error('three: transcodeImage failed')
    }
    // ImageLevelInfo.width × height × 4 should match dstSize for RGBA32.
    if (dst.length !== lvl.width * lvl.height * 4) {
      throw new Error(`three: size mismatch — dst=${dst.length}, expected=${lvl.width * lvl.height * 4}`)
    }
    return dst
  } finally {
    ktx2File.close()
    ktx2File.delete()
  }
}
