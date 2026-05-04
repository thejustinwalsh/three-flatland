// URL-free runtime for the wasm KTX2 transcoder.
//
// Why split: workers imported via Vite's `?worker&inline` get their import
// graph walked by Vite's worker plugin. Any `new URL(..., import.meta.url)`
// in that graph triggers asset-resolution against the inline blob URL,
// which Vite warns on (`[vite:worker] "to" undefined`). The fix is to
// keep all URL-using code (`fetchTranscoderBytes`, `loadTranscoderWasm`)
// out of files the worker imports — leaving only this URL-free module
// (types, offsets, readers, and `instantiateTranscoder` which takes
// pre-fetched bytes) for the worker's static graph.
//
// Main-thread callers should keep importing from `transcoder-loader.ts`,
// which re-exports these symbols and adds the URL-using helpers.

import { createWasiImports } from './wasi-shim.js'

// Flat C ABI surface — one-to-one with basis_transcoder_c_api.h. All numeric
// arguments are i32 unless flagged otherwise; pointers are i32 wasm offsets.
export interface TranscoderExports {
  memory: WebAssembly.Memory

  // Memory + init
  fl_transcoder_alloc: (bytes: number) => number
  fl_transcoder_free: (ptr: number) => void
  fl_transcoder_init: () => number

  // Opaque KTX2 transcoder lifecycle
  fl_ktx2_transcoder_create: () => number
  fl_ktx2_transcoder_destroy: (t: number) => void

  // Container parsing
  fl_ktx2_init: (t: number, bytes: number, bytesLen: number) => number
  fl_ktx2_start_transcoding: (t: number) => number

  // Metadata
  fl_ktx2_get_header: (t: number, outPtr: number) => number
  fl_ktx2_get_level_info: (
    t: number,
    levelIndex: number,
    layerIndex: number,
    faceIndex: number,
    outPtr: number,
  ) => number

  // Transcoding
  fl_ktx2_transcode_level: (
    t: number,
    levelIndex: number,
    layerIndex: number,
    faceIndex: number,
    targetFormat: number,
    outputBuf: number,
    outputBufSizeInBlocksOrPixels: number,
    decodeFlags: number,
  ) => number

  // Format query helpers (no transcoder instance required)
  fl_basis_format_has_alpha: (targetFormat: number) => number
  fl_basis_format_is_uncompressed: (targetFormat: number) => number
  fl_basis_get_bytes_per_block_or_pixel: (targetFormat: number) => number
  fl_basis_format_is_hdr: (targetFormat: number) => number
  fl_basis_is_format_supported: (targetFormat: number, basisTexFormat: number) => number
}

// Error codes mirror basis_transcoder_c_api.h.
export const FL_TRANSCODER_E_OK = 0
export const FL_TRANSCODER_E_BAD_INPUT = -1
export const FL_TRANSCODER_E_NO_INIT = -2
export const FL_TRANSCODER_E_INIT_FAIL = -3
export const FL_TRANSCODER_E_NOT_STARTED = -4
export const FL_TRANSCODER_E_START_FAIL = -5
export const FL_TRANSCODER_E_LEVEL_INFO_FAIL = -6
export const FL_TRANSCODER_E_TRANSCODE_FAIL = -7

// Field offsets in fl_ktx2_header (15 × uint32_t = 60 bytes). Kept in
// lock-step with the C struct definition; if you reorder fields there,
// update both.
export const HEADER_SIZE_BYTES = 60
export const HEADER_OFFSETS = {
  pixelWidth: 0,
  pixelHeight: 4,
  levelCount: 8,
  faceCount: 12,
  layerCount: 16,
  isEtc1s: 20,
  isUastc: 24,
  isHdr: 28,
  hasAlpha: 32,
  isVideo: 36,
  dfdColorModel: 40,
  dfdTransferFunc: 44,
  dfdFlags: 48,
  dfdTotalSamples: 52,
  basisTexFormat: 56,
} as const

// Field offsets in fl_ktx2_level_info (11 × uint32_t = 44 bytes).
export const LEVEL_INFO_SIZE_BYTES = 44
export const LEVEL_INFO_OFFSETS = {
  origWidth: 0,
  origHeight: 4,
  width: 8,
  height: 12,
  numBlocksX: 16,
  numBlocksY: 20,
  blockWidth: 24,
  blockHeight: 28,
  totalBlocks: 32,
  alphaFlag: 36,
  iframeFlag: 40,
} as const

/**
 * Instantiate the wasm transcoder from a byte buffer. Used by the inline
 * (main-thread) path AND by the worker after it receives bytes via the
 * init postMessage.
 */
export async function instantiateTranscoder(bytes: ArrayBuffer): Promise<TranscoderExports> {
  const memoryRef: { current: WebAssembly.Memory | null } = { current: null }
  const imports: WebAssembly.Imports = {
    wasi_snapshot_preview1: createWasiImports(() => {
      if (!memoryRef.current) throw new Error('memory not yet bound')
      return memoryRef.current
    }),
  }
  const result = await (WebAssembly.instantiate as (
    bytes: BufferSource,
    imports: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes, imports)
  const instance = result.instance
  const exports = instance.exports as unknown as TranscoderExports
  memoryRef.current = exports.memory
  // Reactor model: _initialize runs C++ global ctors before any fl_* call.
  const init = (instance.exports as unknown as { _initialize?: () => void })._initialize
  if (typeof init === 'function') init()
  const rc = exports.fl_transcoder_init()
  if (rc !== 0) throw new Error(`fl_transcoder_init failed: ${rc}`)
  return exports
}

// Header struct decoded from wasm memory.
export interface Ktx2Header {
  pixelWidth: number
  pixelHeight: number
  levelCount: number
  faceCount: number
  layerCount: number
  isEtc1s: boolean
  isUastc: boolean
  isHdr: boolean
  hasAlpha: boolean
  isVideo: boolean
  dfdColorModel: number
  dfdTransferFunc: number
  dfdFlags: number
  dfdTotalSamples: number
  basisTexFormat: number
}

export function readKtx2Header(memory: WebAssembly.Memory, ptr: number): Ktx2Header {
  const view = new DataView(memory.buffer, ptr, HEADER_SIZE_BYTES)
  const o = HEADER_OFFSETS
  return {
    pixelWidth: view.getUint32(o.pixelWidth, true),
    pixelHeight: view.getUint32(o.pixelHeight, true),
    levelCount: view.getUint32(o.levelCount, true),
    faceCount: view.getUint32(o.faceCount, true),
    layerCount: view.getUint32(o.layerCount, true),
    isEtc1s: view.getUint32(o.isEtc1s, true) !== 0,
    isUastc: view.getUint32(o.isUastc, true) !== 0,
    isHdr: view.getUint32(o.isHdr, true) !== 0,
    hasAlpha: view.getUint32(o.hasAlpha, true) !== 0,
    isVideo: view.getUint32(o.isVideo, true) !== 0,
    dfdColorModel: view.getUint32(o.dfdColorModel, true),
    dfdTransferFunc: view.getUint32(o.dfdTransferFunc, true),
    dfdFlags: view.getUint32(o.dfdFlags, true),
    dfdTotalSamples: view.getUint32(o.dfdTotalSamples, true),
    basisTexFormat: view.getUint32(o.basisTexFormat, true),
  }
}

// Per-level info struct decoded from wasm memory.
export interface Ktx2LevelInfo {
  origWidth: number
  origHeight: number
  width: number
  height: number
  numBlocksX: number
  numBlocksY: number
  blockWidth: number
  blockHeight: number
  totalBlocks: number
  alphaFlag: boolean
  iframeFlag: boolean
}

export function readKtx2LevelInfo(memory: WebAssembly.Memory, ptr: number): Ktx2LevelInfo {
  const view = new DataView(memory.buffer, ptr, LEVEL_INFO_SIZE_BYTES)
  const o = LEVEL_INFO_OFFSETS
  return {
    origWidth: view.getUint32(o.origWidth, true),
    origHeight: view.getUint32(o.origHeight, true),
    width: view.getUint32(o.width, true),
    height: view.getUint32(o.height, true),
    numBlocksX: view.getUint32(o.numBlocksX, true),
    numBlocksY: view.getUint32(o.numBlocksY, true),
    blockWidth: view.getUint32(o.blockWidth, true),
    blockHeight: view.getUint32(o.blockHeight, true),
    totalBlocks: view.getUint32(o.totalBlocks, true),
    alphaFlag: view.getUint32(o.alphaFlag, true) !== 0,
    iframeFlag: view.getUint32(o.iframeFlag, true) !== 0,
  }
}
