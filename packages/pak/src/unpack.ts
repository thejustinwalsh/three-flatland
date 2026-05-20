import {
  ELEMENT_SIZE,
  PakError,
  type PakBufferDescriptor,
  type PakDataType,
  type PakMetadata,
} from './schema'
import { makeCursor, type RecordCursor } from './records'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942
const SUPPORTED_FORMAT_VERSION = 1

const VIEW_CTORS: Record<PakDataType, any> = {
  Float32: Float32Array,
  Int32: Int32Array,
  Uint32: Uint32Array,
  Uint16: Uint16Array,
  Int16: Int16Array,
  Uint8: Uint8Array,
  Int8: Int8Array,
}

export interface UnpackedPak {
  metadata: PakMetadata
  has(name: string): boolean
  view(name: string): ArrayBufferView
  bytes(name: string): Uint8Array
  records(name: string): RecordCursor
}

export function unpack(buf: ArrayBuffer): UnpackedPak {
  const dv = new DataView(buf)
  if (buf.byteLength < 20) throw new PakError('BAD_CHUNK', 'file too small')
  if (dv.getUint32(0, true) !== MAGIC_LE) throw new PakError('BAD_MAGIC', 'not a .flpak file')
  const formatVersion = dv.getUint32(4, true)
  if (formatVersion > SUPPORTED_FORMAT_VERSION)
    throw new PakError('BAD_FORMAT_VERSION', `formatVersion ${formatVersion} unsupported`)
  const total = dv.getUint32(8, true)
  if (total !== buf.byteLength) throw new PakError('BAD_TOTAL_LENGTH', 'totalLength != byteLength')

  // Walk chunks. First must be JSON, second must be BIN.
  let o = 12
  const readChunk = (expect: number, label: string) => {
    if (o + 8 > total) throw new PakError('BAD_CHUNK', `${label} chunk header past EOF`)
    const len = dv.getUint32(o, true)
    const type = dv.getUint32(o + 4, true)
    if (type !== expect) throw new PakError('BAD_CHUNK', `expected ${label} chunk`)
    if (len % 4 !== 0) throw new PakError('BAD_CHUNK', `${label} chunkLen not /4`)
    const start = o + 8
    if (start + len > total) throw new PakError('BAD_CHUNK', `${label} chunk overruns file`)
    o = start + len
    return { start, len }
  }

  const jsonChunk = readChunk(TYPE_JSON_LE, 'JSON')
  const binChunk = readChunk(TYPE_BIN_LE, 'BIN')
  // (any further chunks are simply ignored)

  let metadata: PakMetadata
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(buf, jsonChunk.start, jsonChunk.len),
    )
    metadata = JSON.parse(text)
  } catch (e) {
    throw new PakError('BAD_JSON', `JSON chunk not valid UTF-8/JSON: ${(e as Error).message}`)
  }
  validateMetadata(metadata)

  const binStart = binChunk.start
  const binLen = binChunk.len
  for (const [name, d] of Object.entries(metadata.buffers)) validateBuffer(name, d, binLen)

  const desc = (name: string): PakBufferDescriptor => {
    const d = metadata.buffers[name]
    if (!d) throw new PakError('BAD_ACCESS', `no buffer "${name}"`)
    return d
  }

  return {
    metadata,
    has: (name) => name in metadata.buffers,
    bytes: (name) => {
      const d = desc(name)
      return new Uint8Array(buf, binStart + d.off, d.len)
    },
    view: (name) => {
      const d = desc(name)
      const Ctor = VIEW_CTORS[d.type]
      return new Ctor(buf, binStart + d.off, d.len / ELEMENT_SIZE[d.type])
    },
    records: (name) => makeCursor(buf, binStart, desc(name), name),
  }
}

function validateMetadata(m: PakMetadata): void {
  if (typeof m?.kind !== 'string' || m.kind.length === 0)
    throw new PakError('BAD_METADATA', 'missing kind')
  if (!Number.isInteger(m.version) || (m.version as number) < 1)
    throw new PakError('BAD_METADATA', 'version must be integer >= 1')
  if (m.buffers == null || typeof m.buffers !== 'object')
    throw new PakError('BAD_METADATA', 'missing buffers')
}

function validateBuffer(name: string, d: PakBufferDescriptor, binLen: number): void {
  if (d.record && d.mime) throw new PakError('BAD_BUFFER', `"${name}": record and mime`)
  const size = ELEMENT_SIZE[d.type]
  if (size == null) throw new PakError('BAD_BUFFER', `"${name}": bad type ${d.type}`)
  if (d.off % 4 !== 0) throw new PakError('BAD_BUFFER', `"${name}": off not /4`)
  if (d.off < 0 || d.off + d.len > binLen) throw new PakError('BAD_BUFFER', `"${name}": out of range`)
  if (d.len % size !== 0) throw new PakError('BAD_BUFFER', `"${name}": len not multiple of ${size}`)
  if (d.record) validateRecord(name, d, size)
}

function validateRecord(name: string, d: PakBufferDescriptor, _size: number): void {
  const r = d.record!
  if (r.stride <= 0) throw new PakError('BAD_RECORD', `"${name}": stride <= 0`)
  if (r.count * r.stride !== d.len)
    throw new PakError('BAD_RECORD', `"${name}": count*stride (${r.count * r.stride}) != len (${d.len})`)
  for (const f of r.fields) {
    const fs = ELEMENT_SIZE[f.type]
    if (fs == null) throw new PakError('BAD_RECORD', `"${name}.${f.name}": bad type`)
    if (f.offset % fs !== 0) throw new PakError('BAD_RECORD', `"${name}.${f.name}": offset not /${fs}`)
    if (f.offset + f.count * fs > r.stride)
      throw new PakError('BAD_RECORD', `"${name}.${f.name}": escapes stride`)
  }
}
