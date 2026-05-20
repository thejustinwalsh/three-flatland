import { AssetError } from './errors'

// GLB magic: "glTF" encoded as a little-endian uint32
const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2

const CHUNK_JSON = 0x4e4f534a // "JSON" LE
const CHUNK_BIN = 0x004e4942 // "BIN\0" LE

/**
 * Result of parsing a standard GLB container.
 *
 * `binByteOffset` is the absolute byte offset of the BIN chunk payload within
 * the original `ArrayBuffer`. When no BIN chunk is present it is set to the
 * offset immediately past the end of the JSON chunk (i.e. `buf.byteLength` for
 * a JSON-only file), and `binByteLength` is `0`. Callers should guard on
 * `binByteLength > 0` before creating typed-array views.
 */
export interface GlbResult {
  /** The parsed glTF JSON document (untyped — callers narrow as needed). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any
  /**
   * Absolute byte offset of the BIN chunk payload.
   * Equals `buf.byteLength` (sentinel) when no BIN chunk is present.
   */
  binByteOffset: number
  /**
   * Byte length of the BIN chunk payload as stored in the chunk header.
   * `0` when no BIN chunk is present.
   */
  binByteLength: number
}

const decoder = new TextDecoder()

/**
 * Parse a standard glTF 2.0 GLB container.
 *
 * Returns the parsed JSON document plus the absolute byte offset and byte
 * length of the BIN chunk payload so callers can build zero-copy typed-array
 * views directly into `buf` without copying bytes.
 *
 * Throws `AssetError('BAD_GLB', …)` on any structural violation, truncation,
 * wrong magic/version, or JSON decode/parse failure.
 */
export function readGLB(buf: ArrayBuffer): GlbResult {
  // -------------------------------------------------------------------------
  // 1. Validate minimum size and read the 12-byte GLB header
  // -------------------------------------------------------------------------
  if (buf.byteLength < 12) {
    throw new AssetError('BAD_GLB', `GLB too short: ${buf.byteLength} bytes (need at least 12)`)
  }

  const view = new DataView(buf)

  const magic = view.getUint32(0, true)
  if (magic !== GLB_MAGIC) {
    throw new AssetError(
      'BAD_GLB',
      `Invalid GLB magic: 0x${magic.toString(16).padStart(8, '0')} (expected 0x${GLB_MAGIC.toString(16)})`
    )
  }

  const version = view.getUint32(4, true)
  if (version !== GLB_VERSION) {
    throw new AssetError('BAD_GLB', `Unsupported GLB version: ${version} (expected ${GLB_VERSION})`)
  }

  const reportedLength = view.getUint32(8, true)
  if (reportedLength > buf.byteLength) {
    throw new AssetError(
      'BAD_GLB',
      `GLB header reports ${reportedLength} bytes but buffer is only ${buf.byteLength} bytes`
    )
  }

  // Use the header-reported length as the logical end of the file so we never
  // walk past what the header claims, even if buf has trailing bytes.
  const fileEnd = reportedLength

  // -------------------------------------------------------------------------
  // 2. Walk chunks starting at offset 12
  // -------------------------------------------------------------------------
  let offset = 12

  // Helper: read a chunk header (8 bytes) and return { chunkLength, chunkType }.
  // Throws if the header or payload would exceed fileEnd.
  function readChunkHeader(at: number): { chunkLength: number; chunkType: number } {
    if (at + 8 > fileEnd) {
      throw new AssetError(
        'BAD_GLB',
        `Chunk header at offset ${at} would exceed file end (${fileEnd})`
      )
    }
    const chunkLength = view.getUint32(at, true)
    const chunkType = view.getUint32(at + 4, true)
    if (at + 8 + chunkLength > fileEnd) {
      throw new AssetError(
        'BAD_GLB',
        `Chunk payload at offset ${at + 8} (length ${chunkLength}) would exceed file end (${fileEnd})`
      )
    }
    return { chunkLength, chunkType }
  }

  // ---- First chunk: must be JSON ----
  const { chunkLength: jsonChunkLength, chunkType: jsonChunkType } = readChunkHeader(offset)
  if (jsonChunkType !== CHUNK_JSON) {
    throw new AssetError(
      'BAD_GLB',
      `First GLB chunk must be JSON (0x${CHUNK_JSON.toString(16)}) but got 0x${jsonChunkType.toString(16)}`
    )
  }

  const jsonPayloadOffset = offset + 8
  const jsonPayloadLength = jsonChunkLength

  // Decode and parse the JSON payload, wrapping any failure as AssetError.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any
  try {
    const jsonText = decoder.decode(new Uint8Array(buf, jsonPayloadOffset, jsonPayloadLength))
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    json = JSON.parse(jsonText)
  } catch (err) {
    throw new AssetError(
      'BAD_GLB',
      `Failed to decode/parse GLB JSON chunk: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  offset = jsonPayloadOffset + jsonPayloadLength

  // ---- Second chunk (optional): BIN ----
  // When absent, binByteOffset is set to the offset just past the JSON chunk
  // (which equals fileEnd for a JSON-only file) and binByteLength is 0.
  let binByteOffset = offset // sentinel: end of JSON chunk / fileEnd
  let binByteLength = 0

  if (offset < fileEnd) {
    const { chunkLength: binChunkLength, chunkType: binChunkType } = readChunkHeader(offset)
    if (binChunkType === CHUNK_BIN) {
      binByteOffset = offset + 8 // first byte of the BIN payload
      binByteLength = binChunkLength
    }
    // Unknown chunk types are silently ignored per the glTF spec.
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  return { json, binByteOffset, binByteLength }
}
