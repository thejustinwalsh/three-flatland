import { ELEMENT_SIZE, PakError, type PakBufferDescriptor, type PakDataType, type PakRecordField } from './schema'
import type { RecordLayout, LayoutType } from './layout'

const READERS: Record<PakDataType, (dv: DataView, o: number) => number> = {
  Float32: (dv, o) => dv.getFloat32(o, true),
  Int32: (dv, o) => dv.getInt32(o, true),
  Uint32: (dv, o) => dv.getUint32(o, true),
  Uint16: (dv, o) => dv.getUint16(o, true),
  Int16: (dv, o) => dv.getInt16(o, true),
  Uint8: (dv, o) => dv.getUint8(o),
  Int8: (dv, o) => dv.getInt8(o),
}
const VIEW_CTORS: Record<PakDataType, any> = {
  Float32: Float32Array, Int32: Int32Array, Uint32: Uint32Array,
  Uint16: Uint16Array, Int16: Int16Array, Uint8: Uint8Array, Int8: Int8Array,
}

export interface RecordCursor {
  readonly count: number
  get(index: number, field: string): number
  getArray(index: number, field: string, out?: ArrayBufferView): ArrayBufferView
}

export interface TypedRecordCursor<L extends RecordLayout> {
  readonly count: number
  get(index: number, field: keyof L['spec'] & string): number
  getArray(index: number, field: keyof L['spec'] & string, out?: ArrayBufferView): ArrayBufferView
  decode(index: number): LayoutType<L>
}

export function makeCursor(buf: ArrayBuffer, binStart: number, d: PakBufferDescriptor, name: string): RecordCursor
export function makeCursor<L extends RecordLayout>(buf: ArrayBuffer, binStart: number, d: PakBufferDescriptor, name: string, layout: L): TypedRecordCursor<L>
export function makeCursor<L extends RecordLayout>(
  buf: ArrayBuffer, binStart: number, d: PakBufferDescriptor, name: string, layout?: L,
): RecordCursor | TypedRecordCursor<L> {
  const r = d.record
  if (!r) throw new PakError('BAD_ACCESS', `buffer "${name}" has no record schema`)
  const base = binStart + d.off
  const dv = new DataView(buf)
  // byName resolves to file's fields — offsets/stride/type come from the file, not the layout
  const byName = new Map<string, PakRecordField>(r.fields.map((f) => [f.name, f]))

  // Validate layout against file if provided; all byte math still uses file fields
  if (layout) {
    for (const [fname, fs] of Object.entries(layout.spec)) {
      const ff = byName.get(fname)
      if (!ff)
        throw new PakError('BAD_ACCESS', `"${name}": layout field "${fname}" not found in file record`)
      if (ff.type !== fs.type)
        throw new PakError(
          'BAD_ACCESS',
          `"${name}.${fname}": file type "${ff.type}" != layout type "${fs.type}"`,
        )
      if (ff.count !== fs.count)
        throw new PakError(
          'BAD_ACCESS',
          `"${name}.${fname}": file count ${ff.count} != layout count ${fs.count}`,
        )
    }
  }

  const field = (fname: string): PakRecordField => {
    const f = byName.get(fname)
    if (!f) throw new PakError('BAD_ACCESS', `"${name}": no field "${fname}"`)
    return f
  }
  const checkIndex = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= r.count)
      throw new PakError('BAD_ACCESS', `"${name}": index ${i} out of range [0,${r.count})`)
  }

  const cursor = {
    count: r.count,
    get(index: number, fname: string): number {
      checkIndex(index)
      const f = field(fname)
      if (f.count !== 1) throw new PakError('BAD_ACCESS', `"${name}.${fname}": use getArray (count ${f.count})`)
      return READERS[f.type](dv, base + index * r.stride + f.offset)
    },
    getArray(index: number, fname: string, out?: ArrayBufferView): ArrayBufferView {
      checkIndex(index)
      const f = field(fname)
      if (f.count === 1) throw new PakError('BAD_ACCESS', `"${name}.${fname}": use get (scalar)`)
      const off = base + index * r.stride + f.offset
      if (out) {
        if (out.constructor !== VIEW_CTORS[f.type] || (out as any).length !== f.count)
          throw new PakError('BAD_ACCESS', `"${name}.${fname}": out buffer mismatch`)
        const reader = READERS[f.type]
        for (let k = 0; k < f.count; k++) (out as any)[k] = reader(dv, off + k * ELEMENT_SIZE[f.type])
        return out
      }
      return new VIEW_CTORS[f.type](buf, off, f.count)
    },
    decode(index: number): LayoutType<L> {
      checkIndex(index)
      const result: Record<string, number | number[]> = {}
      for (const f of r.fields) {
        if (f.count === 1) {
          result[f.name] = READERS[f.type](dv, base + index * r.stride + f.offset)
        } else {
          const arr: number[] = []
          const off = base + index * r.stride + f.offset
          const reader = READERS[f.type]
          const elemSize = ELEMENT_SIZE[f.type]
          for (let k = 0; k < f.count; k++) arr.push(reader(dv, off + k * elemSize))
          result[f.name] = arr
        }
      }
      return result as LayoutType<L>
    },
  }

  return cursor
}
