import Ajv, { type ValidateFunction } from 'ajv'
import schema from 'three-flatland/sprites/atlas.schema.json' with { type: 'json' }
import type { AtlasJson } from './sidecar'

// Authoritative atlas sidecar schema lives at
// packages/three-flatland/src/sprites/atlas.schema.json and is re-exported
// via the 'three-flatland/sprites/atlas.schema.json' package path. Any
// future runtime consumer (the sprite sheet loader, other tools) compiles
// against the same file.

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  // draft 2020-12 keywords already supported in ajv 8; disable strict
  // defaulting so additional-property validation stays permissive where
  // the schema explicitly opted into `additionalProperties: true`.
})

const validate: ValidateFunction<AtlasJson> = ajv.compile<AtlasJson>(
  schema as unknown as object
)

export { validate as validateAtlas }

export function formatAtlasErrors(v: ValidateFunction = validate): string {
  return (v.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
    .join('; ')
}

export function assertValidAtlas(json: unknown): asserts json is AtlasJson {
  if (!validate(json)) {
    throw new Error(`Atlas JSON failed schema: ${formatAtlasErrors()}`)
  }
}
