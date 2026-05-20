import {
  PakError,
  type PakBufferDescriptor,
  type PakDataType,
  type PakMetadata,
  type PakRecordSchema,
} from './schema'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942
const FORMAT_VERSION = 1

export type PakInput =
  | ArrayBuffer
  | ArrayBufferView
  | { data: ArrayBuffer | ArrayBufferView; record?: PakRecordSchema; mime?: string; normalized?: boolean }

export type NamedBuffers = Record<string, PakInput>

function inferType(v: ArrayBuffer | ArrayBufferView): PakDataType {
  if (v instanceof Float32Array) return 'Float32'
  if (v instanceof Int32Array) return 'Int32'
  if (v instanceof Uint32Array) return 'Uint32'
  if (v instanceof Uint16Array) return 'Uint16'
  if (v instanceof Int16Array) return 'Int16'
  if (v instanceof Int8Array) return 'Int8'
  return 'Uint8' // Uint8Array, Uint8ClampedArray, DataView, bare ArrayBuffer
}

function toBytes(v: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  return new Uint8Array(v)
}

const pad4 = (n: number): number => (n + 3) & ~3

export function pack(metadata: Omit<PakMetadata, 'buffers'>, namedBuffers: NamedBuffers): ArrayBuffer {
  if (typeof metadata?.kind !== 'string' || metadata.kind.length === 0)
    throw new PakError('BAD_METADATA', 'metadata.kind (non-empty string) is required')
  const version = metadata.version as unknown
  if (!Number.isInteger(version) || (version as number) < 1)
    throw new PakError('BAD_METADATA', 'metadata.version (integer >= 1) is required')

  const buffers: Record<string, PakBufferDescriptor> = {}
  const slices: Uint8Array[] = []
  let cursor = 0

  for (const [name, input] of Object.entries(namedBuffers)) {
    const isOpts =
      input != null && typeof input === 'object' && 'data' in input && !ArrayBuffer.isView(input)
    const raw = isOpts ? (input as any).data : (input as ArrayBuffer | ArrayBufferView)
    const record: PakRecordSchema | undefined = isOpts ? (input as any).record : undefined
    const mime: string | undefined = isOpts ? (input as any).mime : undefined
    const normalized: boolean | undefined = isOpts ? (input as any).normalized : undefined
    if (record && mime)
      throw new PakError('BAD_BUFFER', `buffer "${name}" sets both record and mime`)

    const bytes = toBytes(raw)
    const desc: PakBufferDescriptor = { off: cursor, len: bytes.byteLength, type: inferType(raw) }
    if (normalized) desc.normalized = true
    if (record) desc.record = record
    if (mime) desc.mime = mime
    buffers[name] = desc

    slices.push(bytes)
    const padded = pad4(bytes.byteLength)
    if (padded > bytes.byteLength) slices.push(new Uint8Array(padded - bytes.byteLength))
    cursor += padded
  }

  const binBytes = cursor
  const jsonRaw = new TextEncoder().encode(JSON.stringify({ ...metadata, buffers }))
  const jsonPadded = pad4(jsonRaw.byteLength)
  const jsonBytes = new Uint8Array(jsonPadded)
  jsonBytes.set(jsonRaw, 0)
  jsonBytes.fill(0x20, jsonRaw.byteLength) // trailing spaces after the complete JSON value

  const total = 12 + 8 + jsonBytes.byteLength + 8 + binBytes
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)

  dv.setUint32(0, MAGIC_LE, true)
  dv.setUint32(4, FORMAT_VERSION, true)
  dv.setUint32(8, total, true)
  let o = 12
  dv.setUint32(o, jsonBytes.byteLength, true)
  dv.setUint32(o + 4, TYPE_JSON_LE, true)
  o += 8
  u8.set(jsonBytes, o)
  o += jsonBytes.byteLength
  dv.setUint32(o, binBytes, true)
  dv.setUint32(o + 4, TYPE_BIN_LE, true)
  o += 8
  for (const s of slices) {
    u8.set(s, o)
    o += s.byteLength
  }

  return out
}
