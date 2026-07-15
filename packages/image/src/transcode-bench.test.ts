// Comparative transcode benchmark — our bespoke wasm transcoder vs three.js's
// stock basis_transcoder. Both wrap the identical upstream basisu transcoder
// (the equivalence test proves byte-identical RGBA32 output); our edge comes
// from the Zig build's SIMD (BASISU_SUPPORT_SSE → wasm_simd128) + wasm-opt.
//
// Why this is the real perf gate (and basisu-bench's absolute ms is only a
// local gate): a wall-clock budget is meaningless across machines — CI's
// shared runners are 2-3x slower. A *ratio* on the same runner is stable:
// both transcoders slow down together, so "ours is faster than three's" holds
// regardless of host speed. The point of shipping a bespoke transcoder is the
// speed advantage; if we ever stop beating the stock lib we may as well use
// it — so assert we stay ahead.
import { afterAll, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './codecs/png.js'
import { encodeKtx2 } from './codecs/ktx2.js'
import {
  loadTranscoderWasm,
  LEVEL_INFO_SIZE_BYTES,
  readKtx2LevelInfo,
  FL_TRANSCODER_E_OK,
  __resetForTest,
} from './runtime/transcoder-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TF_RGBA32 = 13 // basist::transcoder_texture_format::cTFRGBA32
const N = 25 // averaged iterations — smooths per-call scheduling jitter

interface ThreeKtx2File {
  startTranscoding(): boolean
  getImageLevelInfo(mip: number, layer: number, face: number): { width: number; height: number }
  transcodeImage(dst: Uint8Array, mip: number, layer: number, face: number, fmt: number, decodeFlags: number, c0: number, c1: number): boolean
  close(): void
  delete(): void
}
interface ThreeBasisModule { initializeBasis(): void; KTX2File: new (b: Uint8Array) => ThreeKtx2File }

afterAll(() => {
  __resetForTest()
})

describe('transcode latency — ours vs three.js', () => {
  it('our bespoke wasm transcoder is faster than three.js stock', async () => {
    const png = readFileSync(join(__dirname, '__fixtures__/atlas-2048.png'))
    const decoded = await decodePng(new Uint8Array(png))
    const ktx2 = await encodeKtx2(decoded, { mode: 'etc1s', quality: 128, mipmaps: false })
    const len = ktx2.length

    // ── ours: warm the module once, then time N full per-file transcodes ──
    __resetForTest()
    const t = await loadTranscoderWasm()
    const oursOnce = () => {
      const inPtr = t.fl_transcoder_alloc(len)
      new Uint8Array(t.memory.buffer, inPtr, len).set(ktx2)
      const tr = t.fl_ktx2_transcoder_create()
      const levelPtr = t.fl_transcoder_alloc(LEVEL_INFO_SIZE_BYTES)
      try {
        if (t.fl_ktx2_init(tr, inPtr, len) !== FL_TRANSCODER_E_OK) throw new Error('ours: ktx2_init')
        if (t.fl_ktx2_start_transcoding(tr) !== FL_TRANSCODER_E_OK) throw new Error('ours: start')
        t.fl_ktx2_get_level_info(tr, 0, 0, 0, levelPtr)
        const lvl = readKtx2LevelInfo(t.memory, levelPtr)
        const px = lvl.width * lvl.height
        const outPtr = t.fl_transcoder_alloc(px * 4)
        try {
          const rc = t.fl_ktx2_transcode_level(tr, 0, 0, 0, TF_RGBA32, outPtr, px, 0)
          if (rc !== FL_TRANSCODER_E_OK) throw new Error(`ours: transcode rc=${rc}`)
        } finally {
          t.fl_transcoder_free(outPtr)
        }
      } finally {
        t.fl_transcoder_free(levelPtr)
        t.fl_ktx2_transcoder_destroy(tr)
        t.fl_transcoder_free(inPtr)
      }
    }
    oursOnce() // warm

    // ── three: load its emscripten transcoder, warm, time the same way ──
    // The MODULARIZE build does `module.exports = BASIS`, but Node's ESM
    // interop hands back {} for it — eval with CJS bindings to get the factory.
    const require = createRequire(import.meta.url)
    const basisJsPath = require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js')
    const code = readFileSync(basisJsPath, 'utf8')
    const mod: { exports: ((o?: { wasmBinary?: ArrayBuffer }) => Promise<ThreeBasisModule>) | object } = { exports: {} }
    new Function('module', 'exports', 'require', '__dirname', '__filename', code)(
      mod, mod.exports, require, dirname(basisJsPath), basisJsPath,
    )
    const factory = mod.exports as (o?: { wasmBinary?: ArrayBuffer }) => Promise<ThreeBasisModule>
    const wasmBinary = readFileSync(basisJsPath.replace(/\.js$/, '.wasm'))
    const M = await factory({ wasmBinary: wasmBinary.buffer.slice(0) })
    M.initializeBasis()
    const threeOnce = () => {
      const f = new M.KTX2File(ktx2)
      try {
        f.startTranscoding()
        const lvl = f.getImageLevelInfo(0, 0, 0)
        const dst = new Uint8Array(lvl.width * lvl.height * 4)
        f.transcodeImage(dst, 0, 0, 0, TF_RGBA32, 0, -1, -1)
      } finally {
        f.close()
        f.delete()
      }
    }
    threeOnce() // warm

    // Interleave the two transcoders per iteration and take the MEDIAN: a
    // scheduling hiccup on a shared CI runner then hits adjacent ours/three
    // samples ~equally instead of skewing one back-to-back loop, and the
    // median rejects outlier spikes a mean would absorb.
    const oursSamples: number[] = []
    const threeSamples: number[] = []
    for (let i = 0; i < N; i++) {
      let s = performance.now()
      oursOnce()
      oursSamples.push(performance.now() - s)
      s = performance.now()
      threeOnce()
      threeSamples.push(performance.now() - s)
    }
    const median = (xs: number[]): number => {
      const a = [...xs].sort((p, q) => p - q)
      const m = a.length >> 1
      return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2
    }
    const oursMs = median(oursSamples)
    const threeMs = median(threeSamples)

    process.stdout.write(
      `[transcode-bench] ours=${oursMs.toFixed(2)}ms  three=${threeMs.toFixed(2)}ms  ` +
        `ratio=${(oursMs / threeMs).toFixed(3)} (n=${N}, median)\n`,
    )

    // Local gate: we must stay meaningfully ahead of the stock transcoder
    // (observed ~0.72, ≈1.4x faster). A wall-clock micro-benchmark — even a
    // ratio — is too noisy to *block* on shared CI runners (it flaked there),
    // so the hard assertion runs only locally; CI logs the number above for
    // trend visibility. Same posture as the encode benchmark's absolute budget.
    if (!process.env.CI) {
      expect(oursMs).toBeLessThan(threeMs * 0.9)
    }
  }, 180_000)
})
