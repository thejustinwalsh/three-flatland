import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'

// Inline copy of atlas.schema.json — kept in sync with the JSON file.
// We avoid a JSON import here so this module can be built with tsup's
// bundle:false mode (which emits bare `import ... from "...json"` in the
// output, and the JSON does not exist in dist/).
const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://three-flatland.dev/schemas/atlas.v1.json',
  title: 'three-flatland Sprite Atlas',
  type: 'object',
  required: ['meta', 'frames'],
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    meta: {
      type: 'object',
      required: ['sources', 'size'],
      additionalProperties: true,
      properties: {
        app: { type: 'string' },
        version: { type: 'string' },
        size: { $ref: '#/$defs/Size' },
        scale: { type: 'string' },
        format: { type: 'string' },
        pivot: { $ref: '#/$defs/Vec2' },
        normal: { type: 'string' },
        sources: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/$defs/SourceEntry' },
        },
        animations: {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/Animation' },
        },
        frameTags: {
          type: 'array',
          items: { $ref: '#/$defs/AsepriteFrameTag' },
        },
      },
    },
    frames: {
      type: 'object',
      patternProperties: { '^.+$': { $ref: '#/$defs/Frame' } },
      additionalProperties: false,
    },
  },
  $defs: {
    Size: {
      type: 'object',
      required: ['w', 'h'],
      additionalProperties: false,
      properties: {
        w: { type: 'integer', minimum: 1 },
        h: { type: 'integer', minimum: 1 },
      },
    },
    Rect: {
      type: 'object',
      required: ['x', 'y', 'w', 'h'],
      additionalProperties: false,
      properties: {
        x: { type: 'integer', minimum: 0 },
        y: { type: 'integer', minimum: 0 },
        w: { type: 'integer', minimum: 0 },
        h: { type: 'integer', minimum: 0 },
      },
    },
    Vec2: {
      type: 'object',
      required: ['x', 'y'],
      additionalProperties: false,
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
    },
    Frame: {
      type: 'object',
      required: ['frame', 'rotated', 'trimmed', 'spriteSourceSize', 'sourceSize'],
      additionalProperties: false,
      properties: {
        frame: { $ref: '#/$defs/Rect' },
        rotated: { type: 'boolean' },
        trimmed: { type: 'boolean' },
        spriteSourceSize: { $ref: '#/$defs/Rect' },
        sourceSize: { $ref: '#/$defs/Size' },
        pivot: { $ref: '#/$defs/Vec2' },
        duration: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    SourceEntry: {
      type: 'object',
      required: ['format', 'uri'],
      additionalProperties: false,
      properties: {
        format: { type: 'string', enum: ['png', 'webp', 'avif', 'ktx2'] },
        uri: { type: 'string' },
      },
    },
    Animation: {
      type: 'object',
      required: ['frameSet', 'frames'],
      additionalProperties: false,
      properties: {
        frameSet: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
          minItems: 1,
        },
        frames: {
          type: 'array',
          items: { type: 'integer', minimum: 0 },
          minItems: 1,
        },
        fps: { type: 'number', exclusiveMinimum: 0 },
        loop: { type: 'boolean' },
        pingPong: { type: 'boolean' },
        events: {
          type: 'object',
          patternProperties: { '^[0-9]+$': { type: 'string' } },
          additionalProperties: false,
        },
      },
    },
    AsepriteFrameTag: {
      type: 'object',
      required: ['name', 'from', 'to'],
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        from: { type: 'integer', minimum: 0 },
        to: { type: 'integer', minimum: 0 },
        direction: {
          type: 'string',
          enum: ['forward', 'reverse', 'pingpong', 'pingpong_reverse'],
        },
        color: { type: 'string' },
        repeat: { type: 'string' },
        data: { type: 'string' },
      },
    },
  },
} as const

const ajv = new Ajv2020({ allErrors: true, strict: false })
const ajvValidate: ValidateFunction = ajv.compile(SCHEMA as object)

let lastErrors: string[] = []

export const atlasSchema = SCHEMA

export function validateAtlas(json: unknown): boolean {
  lastErrors = []
  if (!ajvValidate(json)) {
    lastErrors = (ajvValidate.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`,
    )
    return false
  }
  const sources = (json as { meta: { sources: { format: string }[] } }).meta.sources
  const seen = new Set<string>()
  for (const s of sources) {
    if (seen.has(s.format)) {
      lastErrors.push(`/meta/sources duplicate format "${s.format}"`)
      return false
    }
    seen.add(s.format)
  }
  return true
}

export function formatAtlasErrors(): string {
  return lastErrors.join('; ')
}

export function assertValidAtlas(json: unknown): void {
  if (!validateAtlas(json)) {
    throw new Error(`Atlas JSON failed schema: ${formatAtlasErrors()}`)
  }
}
