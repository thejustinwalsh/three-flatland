import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import schema from 'three-flatland/sprites/atlas.schema.json' with { type: 'json' }
import type { AtlasJson } from './sidecar'

// Authoritative atlas sidecar schema lives at
// packages/three-flatland/src/sprites/atlas.schema.json and is re-exported
// via the 'three-flatland/sprites/atlas.schema.json' package path. Any
// future runtime consumer (the sprite sheet loader, other tools) compiles
// against the same file.
//
// The schema declares `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
// ajv's default `Ajv` class only knows draft-07; importing `Ajv2020` from
// `ajv/dist/2020` ships the draft 2020-12 meta-schema so compile() can
// resolve it at module load. Using the default `Ajv` throws
// "no schema with key or ref ..." at extension activation.

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
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
