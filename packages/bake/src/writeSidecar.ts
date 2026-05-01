import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import type { BakedSidecarMetadata } from './types.js'

/**
 * Write a PNG with a flatland metadata `tEXt` chunk stamped in.
 *
 * The stamp lives under keyword `flatland` and carries the descriptor
 * hash so downstream `probeBakedSibling` calls can invalidate the
 * baked file when the descriptor changes.
 */
export function writeSidecarPng(
  outputPath: string,
  pixels: Uint8Array,
  width: number,
  height: number,
  metadata: BakedSidecarMetadata
): void {
  const png = new PNG({ width, height })
  png.data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  const buffer = PNG.sync.write(png)
  const stamped = injectTextChunk(buffer, 'flatland', JSON.stringify(metadata))
  writeFileSync(outputPath, stamped)
}

/**
 * Write a sidecar descriptor JSON file adjacent to the source asset.
 *
 * Same file format `flatland-bake <subcommand> --descriptor` consumes,
 * so the runtime and CLI agree on one shape.
 */
export function writeSidecarJson(outputPath: string, descriptor: unknown): void {
  writeFileSync(outputPath, JSON.stringify(descriptor, null, 2) + '\n')
}

/**
 * Inject a `tEXt` chunk immediately after the IHDR so the metadata is
 * near the head of the file — `probeBakedSibling` range-fetches ~4 KB
 * to read the stamp, so placement matters.
 */
function injectTextChunk(pngBuffer: Buffer, keyword: string, value: string): Buffer {
  const sigLen = 8
  // IHDR type starts 4 bytes after the length prefix: [len][I][H][D][R]...
  if (
    pngBuffer[sigLen + 4] !== 0x49 ||
    pngBuffer[sigLen + 5] !== 0x48 ||
    pngBuffer[sigLen + 6] !== 0x44 ||
    pngBuffer[sigLen + 7] !== 0x52
  ) {
    return pngBuffer
  }
  const ihdrLength = pngBuffer.readUInt32BE(sigLen)
  const ihdrEnd = sigLen + 8 + ihdrLength + 4 // length(4) + type(4) + data + CRC(4)

  const textData = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(value, 'latin1'),
  ])
  const textType = Buffer.from('tEXt', 'latin1')
  const textLen = Buffer.alloc(4)
  textLen.writeUInt32BE(textData.length, 0)
  const textCrc = Buffer.alloc(4)
  textCrc.writeUInt32BE(crc32(Buffer.concat([textType, textData])), 0)
  const textChunk = Buffer.concat([textLen, textType, textData, textCrc])

  return Buffer.concat([pngBuffer.subarray(0, ihdrEnd), textChunk, pngBuffer.subarray(ihdrEnd)])
}

let _crcTable: Uint32Array | null = null
function crcTable(): Uint32Array {
  if (_crcTable) return _crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  _crcTable = table
  return table
}

function crc32(buffer: Buffer): number {
  const table = crcTable()
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = (table[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}
