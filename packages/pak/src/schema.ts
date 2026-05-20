export type PakDataType = 'Float32' | 'Int32' | 'Uint32' | 'Uint16' | 'Int16' | 'Uint8' | 'Int8'

export const ELEMENT_SIZE: Record<PakDataType, number> = {
  Float32: 4, Int32: 4, Uint32: 4, Uint16: 2, Int16: 2, Uint8: 1, Int8: 1,
}

export interface PakRecordField {
  name: string
  type: PakDataType
  offset: number
  count: number
  normalized?: boolean
}

export interface PakRecordSchema {
  stride: number
  count: number
  fields: PakRecordField[]
}

export interface PakBufferDescriptor {
  off: number
  len: number
  type: PakDataType
  normalized?: boolean
  record?: PakRecordSchema
  mime?: string
}

export interface PakMetadata {
  kind: string
  version: number
  name?: string
  buffers: Record<string, PakBufferDescriptor>
  [key: string]: unknown
}

export type PakErrorCode =
  | 'BAD_MAGIC' | 'BAD_FORMAT_VERSION' | 'BAD_TOTAL_LENGTH' | 'BAD_CHUNK'
  | 'BAD_JSON' | 'BAD_METADATA' | 'BAD_BUFFER' | 'BAD_RECORD' | 'BAD_ACCESS'

export class PakError extends Error {
  code: PakErrorCode
  constructor(code: PakErrorCode, message: string) {
    super(message)
    this.name = 'PakError'
    this.code = code
  }
}

// Published verbatim as ./flpak-metadata.schema.json (Step 5). Keep in sync.
export const PAK_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://three-flatland.dev/schema/flpak-metadata.json',
  title: 'FlatlandPackageMetadata',
  type: 'object',
  required: ['kind', 'version', 'buffers'],
  additionalProperties: true,
  properties: {
    kind: { type: 'string', minLength: 1 },
    version: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    buffers: { type: 'object', additionalProperties: { $ref: '#/$defs/buffer' } },
  },
  $defs: {
    dataType: { enum: ['Float32', 'Int32', 'Uint32', 'Uint16', 'Int16', 'Uint8', 'Int8'] },
    buffer: {
      type: 'object',
      required: ['off', 'len', 'type'],
      not: { required: ['record', 'mime'] },
      properties: {
        off: { type: 'integer', minimum: 0, multipleOf: 4 },
        len: { type: 'integer', minimum: 0 },
        type: { $ref: '#/$defs/dataType' },
        normalized: { type: 'boolean' },
        mime: { type: 'string' },
        record: { $ref: '#/$defs/record' },
      },
    },
    record: {
      type: 'object',
      required: ['stride', 'count', 'fields'],
      properties: {
        stride: { type: 'integer', minimum: 1 },
        count: { type: 'integer', minimum: 0 },
        fields: { type: 'array', items: { $ref: '#/$defs/field' }, minItems: 1 },
      },
    },
    field: {
      type: 'object',
      required: ['name', 'type', 'offset', 'count'],
      properties: {
        name: { type: 'string', minLength: 1 },
        type: { $ref: '#/$defs/dataType' },
        offset: { type: 'integer', minimum: 0 },
        count: { type: 'integer', minimum: 1 },
        normalized: { type: 'boolean' },
      },
    },
  },
} as const
