import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import sourceSchema from './schema.json' with { type: 'json' }
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
