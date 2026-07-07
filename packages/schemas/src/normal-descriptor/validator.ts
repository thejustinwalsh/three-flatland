import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import sourceSchema from './schema.json' with { type: 'json' }
import { schemaIdFor } from '../version'

// Inject $id from the schemas package version (single source of truth) so the
// in-memory schema knows its own public URL. Schema source intentionally omits
// $id; changesets-managed package version dictates the value.
export const normalDescriptorSchema = {
  $id: schemaIdFor('normal-descriptor'),
  ...sourceSchema,
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
const ajvValidate: ValidateFunction = ajv.compile(normalDescriptorSchema as object)

let lastErrors: string[] = []

export function validateNormalDescriptor(json: unknown): boolean {
  lastErrors = []
  if (!ajvValidate(json)) {
    lastErrors = (ajvValidate.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`
    )
    return false
  }
  return true
}

export function formatNormalDescriptorErrors(): string {
  return lastErrors.join('; ')
}

export function assertValidNormalDescriptor(json: unknown): void {
  if (!validateNormalDescriptor(json)) {
    throw new Error(`Normal descriptor JSON failed schema: ${formatNormalDescriptorErrors()}`)
  }
}
