import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import schema from './schema.json' with { type: 'json' }
import { validateAtlas, formatAtlasErrors } from './validator'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__', import.meta.url))

function loadFixture(category: 'valid' | 'invalid', name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}/${category}/${name}`, 'utf8'))
}

function listFixtures(category: 'valid' | 'invalid'): string[] {
  return readdirSync(`${FIXTURES_DIR}/${category}`)
    .filter((f) => f.endsWith('.json'))
    .sort()
}

describe('atlas.schema.json — valid fixtures round-trip', () => {
  // Every file under __fixtures__/valid/ must validate with zero ajv
  // errors. New fixtures are picked up automatically — no test to add when
  // a new valid shape is captured.
  for (const name of listFixtures('valid')) {
    it(`accepts ${name}`, () => {
      const json = loadFixture('valid', name)
      const ok = validate(json)
      expect(ok, JSON.stringify(validate.errors)).toBe(true)
    })
  }
})

describe('atlas.schema.json — invalid fixtures assert a specific ajv error', () => {
  it('missing-sources.atlas.json — meta fails the sources|image anyOf', () => {
    const json = loadFixture('invalid', 'missing-sources.atlas.json')
    expect(validate(json)).toBe(false)
    // ajv reports one `required` error per anyOf branch plus a summarizing
    // `anyOf` error at the combinator itself — the summarizing one is the
    // stable assertion target (branch-level errors are anyOf implementation
    // detail, not part of the schema's public contract).
    expect(validate.errors).toContainEqual(
      expect.objectContaining({ instancePath: '/meta', keyword: 'anyOf' })
    )
  })

  it('empty-sources.atlas.json — meta.sources fails minItems', () => {
    const json = loadFixture('invalid', 'empty-sources.atlas.json')
    expect(validate(json)).toBe(false)
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '/meta/sources',
        keyword: 'minItems',
        params: { limit: 1 },
      })
    )
  })

  it('bad-rect.atlas.json — Rect.x fails the integer type check', () => {
    const json = loadFixture('invalid', 'bad-rect.atlas.json')
    expect(validate(json)).toBe(false)
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '/frames/hero_idle_0/frame/x',
        keyword: 'type',
        params: { type: 'integer' },
      })
    )
  })

  it('duplicate-format-sources.atlas.json — passes bare ajv (format-uniqueness is a validateAtlas()-only rule)', () => {
    // JSON Schema has no built-in "array items must be unique by a derived
    // key" keyword (uniqueItems compares whole items, not `.format`), so
    // format-uniqueness is enforced by validateAtlas()'s post-schema pass,
    // not the schema itself. This fixture's name says "invalid" from the
    // suite's perspective (validateAtlas rejects it — see the next describe
    // block) but it is schema-valid on its own, which this test documents
    // as an intentional layering split rather than a gap.
    const json = loadFixture('invalid', 'duplicate-format-sources.atlas.json')
    expect(validate(json)).toBe(true)
  })
})

describe('validateAtlas (format-uniqueness layer)', () => {
  it('rejects duplicate formats in meta.sources', () => {
    const json = loadFixture('invalid', 'duplicate-format-sources.atlas.json')
    expect(validateAtlas(json)).toBe(false)
    expect(formatAtlasErrors()).toBe('/meta/sources duplicate format "png"')
  })

  it('accepts unique formats (multi-source.atlas.json already covers this at the schema layer)', () => {
    const json = loadFixture('valid', 'multi-source.atlas.json')
    expect(validateAtlas(json)).toBe(true)
  })

  it('accepts a meta.image-only sidecar without a sources array to dedupe', () => {
    // Regression: the format-uniqueness pass used to assume `meta.sources`
    // always exists and would throw on an image-only atlas.
    const json = loadFixture('valid', 'legacy-texturepacker-image.atlas.json')
    expect(validateAtlas(json)).toBe(true)
  })
})
