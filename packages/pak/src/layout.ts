import { ELEMENT_SIZE, type PakDataType, type PakRecordSchema } from './schema'

// FieldSpec with literal-typed count so LayoutType can discriminate scalar vs vector
export interface FieldSpec<T extends PakDataType = PakDataType, C extends number = number> {
  type: T
  count: C
}

export const f32 = { type: 'Float32', count: 1 } as const satisfies FieldSpec
export const i32 = { type: 'Int32', count: 1 } as const satisfies FieldSpec
export const u32 = { type: 'Uint32', count: 1 } as const satisfies FieldSpec
export const u16 = { type: 'Uint16', count: 1 } as const satisfies FieldSpec
export const i16 = { type: 'Int16', count: 1 } as const satisfies FieldSpec
export const u8 = { type: 'Uint8', count: 1 } as const satisfies FieldSpec
export const i8 = { type: 'Int8', count: 1 } as const satisfies FieldSpec

// vec produces count: number (not a literal), so LayoutType maps it to number[]
export const vec = <T extends PakDataType>(spec: FieldSpec<T>, n: number): FieldSpec<T, number> => ({
  type: spec.type,
  count: n,
})

export type RecordLayoutSpec = Record<string, FieldSpec>

export interface RecordLayout<S extends RecordLayoutSpec = RecordLayoutSpec> {
  schema: PakRecordSchema
  spec: S
}

// Decoded TS type: scalar field (count: 1 literal) -> number; vector field (count: number) -> number[]
export type LayoutType<L extends RecordLayout> = {
  [K in keyof L['spec']]: L['spec'][K]['count'] extends 1 ? number : number[]
}

const alignUp = (n: number, a: number): number => (n + (a - 1)) & ~(a - 1)

export function defineRecord<S extends RecordLayoutSpec>(spec: S): RecordLayout<S> {
  let offset = 0
  let maxElem = 1
  const fields = Object.entries(spec).map(([name, fs]) => {
    const size = ELEMENT_SIZE[fs.type]
    offset = alignUp(offset, size)
    const field = { name, type: fs.type, offset, count: fs.count }
    offset += size * fs.count
    if (size > maxElem) maxElem = size
    return field
  })
  const stride = alignUp(offset, maxElem)
  return { schema: { stride, count: 0, fields }, spec }
}

export function recordFor<L extends RecordLayout>(layout: L, count: number): PakRecordSchema {
  return { ...layout.schema, count }
}
