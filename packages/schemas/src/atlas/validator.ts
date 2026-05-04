import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import schema from './schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const ajvValidate: ValidateFunction = ajv.compile(schema as object)

let lastErrors: string[] = []

export const atlasSchema = schema

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
