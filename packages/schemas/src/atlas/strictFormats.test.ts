import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  validateTexturePackerAtlas,
  formatTexturePackerAtlasErrors,
  validateAsepriteAtlas,
  formatAsepriteAtlasErrors,
} from './validator'

const FIXTURES_DIR = fileURLToPath(new URL('./__fixtures__/valid', import.meta.url))

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}/${name}`, 'utf8'))
}

// These prove the strict per-format schemas (texturepacker.schema.json /
// aseprite.schema.json) accept genuinely real-world TexturePacker/Aseprite
// exports, and — the actual point of building them — reject our own
// format when it uses OUR extensions (`meta.sources`/`meta.animations`).
// Our main permissive schema.json (validator.test.ts's fixture sweep)
// happily accepts all of these; it's a strict superset by design and
// can't catch format-leakage on its own.
describe('strict per-format schemas', () => {
  it('accepts a real TexturePacker JSON-Hash export (image-only meta)', () => {
    const json = loadFixture('legacy-texturepacker-image.atlas.json')
    expect(validateTexturePackerAtlas(json), formatTexturePackerAtlasErrors()).toBe(true)
  })

  it('accepts a real TexturePacker polygon-trim export (vertices/verticesUV/triangles)', () => {
    const json = loadFixture('legacy-texturepacker-vertices.atlas.json')
    expect(validateTexturePackerAtlas(json), formatTexturePackerAtlasErrors()).toBe(true)
  })

  it('accepts a real Aseprite export (frameTags + per-frame duration)', () => {
    const json = loadFixture('legacy-aseprite.atlas.json')
    expect(validateAsepriteAtlas(json), formatAsepriteAtlasErrors()).toBe(true)
  })

  it('rejects our own native format for both strict schemas — meta.sources/meta.animations are our extensions', () => {
    const json = loadFixture('basic.atlas.json')
    expect(validateTexturePackerAtlas(json)).toBe(false)
    expect(formatTexturePackerAtlasErrors()).toContain('/meta')
    expect(validateAsepriteAtlas(json)).toBe(false)
    expect(formatAsepriteAtlasErrors()).toContain('/meta')
  })

  it('rejects our own baked frame.mesh under the strict TexturePacker schema — mesh is ours-only', () => {
    const json = loadFixture('mesh-frame.atlas.json')
    expect(validateTexturePackerAtlas(json)).toBe(false)
  })

  it('rejects our own baked frame.mesh under the strict Aseprite schema — mesh is ours-only', () => {
    const json = loadFixture('mesh-frame.atlas.json')
    expect(validateAsepriteAtlas(json)).toBe(false)
  })

  it('rejects TexturePacker polygon-trim fields under the strict Aseprite schema', () => {
    const json = loadFixture('legacy-texturepacker-vertices.atlas.json')
    expect(validateAsepriteAtlas(json)).toBe(false)
  })
})
