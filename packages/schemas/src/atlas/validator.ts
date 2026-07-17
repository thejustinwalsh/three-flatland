import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import sourceSchema from './schema.json' with { type: 'json' }
import texturePackerSchema from './texturepacker.schema.json' with { type: 'json' }
import asepriteSchema from './aseprite.schema.json' with { type: 'json' }
import { schemaIdFor } from '../version'

// Inject $id from the schemas package version (single source of truth) so the
// in-memory schema knows its own public URL. Schema source intentionally omits
// $id; changesets-managed package version dictates the value.
export const atlasSchema = { $id: schemaIdFor('atlas'), ...sourceSchema }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const ajvValidate: ValidateFunction = ajv.compile(atlasSchema as object)

let lastErrors: string[] = []

export function validateAtlas(json: unknown): boolean {
  lastErrors = []
  if (!ajvValidate(json)) {
    lastErrors = (ajvValidate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
    return false
  }
  const sources = (json as { meta: { sources?: { format: string }[] } }).meta.sources
  if (sources) {
    const seen = new Set<string>()
    for (const s of sources) {
      if (seen.has(s.format)) {
        lastErrors.push(`/meta/sources duplicate format "${s.format}"`)
        return false
      }
      seen.add(s.format)
    }
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

// Test-only strict schemas — NOT used to validate arbitrary input on load
// (validateAtlas/assertValidAtlas above, against our own permissive
// superset schema, stay the ones used for that). These exist to prove
// tools/io/src/atlas/formats.ts's buildTexturePackerJson/buildAsepriteJson
// output is a genuinely faithful export in that format — i.e. that it
// doesn't leak our own extensions (meta.sources/animations, Frame.mesh) or
// the OTHER foreign format's fields (Frame.duration, Frame.vertices/
// verticesUV/triangles) into it. See texturepacker.schema.json /
// aseprite.schema.json's own doc comments for the field-by-field reasoning.
const ajvValidateTexturePacker: ValidateFunction = ajv.compile(texturePackerSchema as object)
const ajvValidateAseprite: ValidateFunction = ajv.compile(asepriteSchema as object)

let lastTexturePackerErrors: string[] = []
let lastAsepriteErrors: string[] = []

export function validateTexturePackerAtlas(json: unknown): boolean {
  lastTexturePackerErrors = []
  if (ajvValidateTexturePacker(json)) return true
  lastTexturePackerErrors = (ajvValidateTexturePacker.errors ?? []).map(
    (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`
  )
  return false
}

export function formatTexturePackerAtlasErrors(): string {
  return lastTexturePackerErrors.join('; ')
}

export function assertValidTexturePackerAtlas(json: unknown): void {
  if (!validateTexturePackerAtlas(json)) {
    throw new Error(`TexturePacker atlas JSON failed strict schema: ${formatTexturePackerAtlasErrors()}`)
  }
}

export function validateAsepriteAtlas(json: unknown): boolean {
  lastAsepriteErrors = []
  if (ajvValidateAseprite(json)) return true
  lastAsepriteErrors = (ajvValidateAseprite.errors ?? []).map(
    (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`
  )
  return false
}

export function formatAsepriteAtlasErrors(): string {
  return lastAsepriteErrors.join('; ')
}

export function assertValidAsepriteAtlas(json: unknown): void {
  if (!validateAsepriteAtlas(json)) {
    throw new Error(`Aseprite atlas JSON failed strict schema: ${formatAsepriteAtlasErrors()}`)
  }
}
