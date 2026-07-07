// Guards atlas.schema.json and the generated `AtlasJson` TS type
// (packages/three-flatland/src/sprites/atlas.types.gen.ts, itself produced
// FROM this schema by scripts/gen-schema-types.ts) from drifting apart. If
// this ever fails after a schema edit: run `pnpm gen:types` to regenerate
// the .gen.ts file, then re-run this test — a real mismatch after that
// means the schema encodes something json-schema-to-typescript couldn't
// carry through faithfully, or vice versa.
import { describe, expect, it } from 'vitest'
import { createGenerator } from 'ts-json-schema-generator'
import { fileURLToPath } from 'node:url'
import schema from './schema.json' with { type: 'json' }
import { buildOurDefs, buildTheirDefs, compareAtlasSchemaToType } from './typeParity'

describe('atlas.schema.json <-> AtlasJson type parity', () => {
  it('has no structural drift between the schema and the generated type', () => {
    const typesGenPath = fileURLToPath(
      new URL('../../../three-flatland/src/sprites/atlas.types.gen.ts', import.meta.url)
    )
    const tsconfigPath = fileURLToPath(
      new URL('../../../three-flatland/tsconfig.json', import.meta.url)
    )

    const generated = createGenerator({
      path: typesGenPath,
      tsconfig: tsconfigPath,
      type: 'AtlasJson',
      expose: 'export',
      jsDoc: 'none',
    }).createSchema('AtlasJson')

    const ourDefs = buildOurDefs(schema as Record<string, unknown>)
    const theirDefs = buildTheirDefs(generated as unknown as Record<string, unknown>)

    const result = compareAtlasSchemaToType(ourDefs, theirDefs)
    expect(result.errors, result.errors.join('\n')).toEqual([])
    expect(result.ok).toBe(true)
  })
})

// Direct unit coverage of the comparator against synthetic defs — proves
// it actually flags drift rather than passing vacuously.
describe('compareAtlasSchemaToType — catches real divergence', () => {
  const baseline = {
    AtlasJson: {
      type: 'object',
      properties: { meta: { $ref: '#/$defs/Meta' } },
      required: ['meta'],
      additionalProperties: false,
    },
    Meta: {
      type: 'object',
      properties: { size: { type: 'string' }, kind: { type: 'string', enum: ['a', 'b'] } },
      required: ['size'],
      additionalProperties: false,
    },
  }
  const theirsBaseline = {
    AtlasJson: {
      type: 'object',
      properties: { meta: { $ref: '#/definitions/Meta' } },
      required: ['meta'],
      additionalProperties: false,
    },
    Meta: {
      type: 'object',
      properties: { size: { type: 'string' }, kind: { type: 'string', enum: ['a', 'b'] } },
      required: ['size'],
      additionalProperties: false,
    },
  }

  it('reports no errors for identical shapes (sanity check on the baseline fixtures)', () => {
    expect(compareAtlasSchemaToType(baseline, theirsBaseline).ok).toBe(true)
  })

  it('flags a property present only in the schema', () => {
    const ours = {
      ...baseline,
      Meta: {
        ...baseline.Meta,
        properties: { ...baseline.Meta.properties, extra: { type: 'string' } },
      },
    }
    const result = compareAtlasSchemaToType(ours, theirsBaseline)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/only in atlas\.schema\.json — extra/)
  })

  it('flags a property present only in the generated type', () => {
    const theirs = {
      ...theirsBaseline,
      Meta: {
        ...theirsBaseline.Meta,
        properties: { ...theirsBaseline.Meta.properties, extra: { type: 'string' } },
      },
    }
    const result = compareAtlasSchemaToType(baseline, theirs)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/only in the generated AtlasJson type — extra/)
  })

  it('flags a required-field mismatch', () => {
    const theirs = { ...theirsBaseline, Meta: { ...theirsBaseline.Meta, required: [] } }
    const result = compareAtlasSchemaToType(baseline, theirs)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/required.*only in atlas\.schema\.json — size/)
  })

  it('flags an enum value-set mismatch', () => {
    const theirs = {
      ...theirsBaseline,
      Meta: {
        ...theirsBaseline.Meta,
        properties: {
          ...theirsBaseline.Meta.properties,
          kind: { type: 'string', enum: ['a', 'c'] },
        },
      },
    }
    const result = compareAtlasSchemaToType(baseline, theirs)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/enum/)
  })

  it('flags a missing named def on the generated side', () => {
    const { Meta: _drop, ...theirs } = theirsBaseline
    const result = compareAtlasSchemaToType(baseline, theirs as typeof theirsBaseline)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/missing from the generated AtlasJson type/)
  })
})
