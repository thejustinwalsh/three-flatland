import { describe, expect, it } from 'vitest'
import { animationInputToFrameTag, buildAsepriteJson, buildTexturePackerJson, detectAtlasFormat } from './formats'
import { atlasToRects, importAsepriteFrameTags } from './build'
import type { AnimationInput, AtlasJson } from './types'
import { assertValidTexturePackerAtlas, assertValidAsepriteAtlas } from '@three-flatland/schemas/atlas'

describe('detectAtlasFormat', () => {
  it('detects our own files via meta.app', () => {
    const json: AtlasJson = { meta: { app: 'fl-sprite-atlas', size: { w: 1, h: 1 } }, frames: {} }
    expect(detectAtlasFormat(json)).toBe('native')
  })

  it('detects a real TexturePacker export via meta.app', () => {
    const json: AtlasJson = {
      meta: { app: 'https://www.codeandweb.com/texturepacker', size: { w: 1, h: 1 } },
      frames: {},
    }
    expect(detectAtlasFormat(json)).toBe('texturepacker')
  })

  it('detects a real Aseprite export via meta.app', () => {
    const json: AtlasJson = {
      meta: { app: 'http://www.aseprite.org/', size: { w: 1, h: 1 } },
      frames: {},
    }
    expect(detectAtlasFormat(json)).toBe('aseprite')
  })

  it('treats a bare file with no meta.app as TexturePacker (we always annotate our own files)', () => {
    const json: AtlasJson = { meta: { size: { w: 1, h: 1 } }, frames: {} }
    expect(detectAtlasFormat(json)).toBe('texturepacker')
  })

  it('treats a bare file carrying frameTags as Aseprite even without meta.app', () => {
    const json: AtlasJson = {
      meta: { size: { w: 1, h: 1 }, frameTags: [{ name: 'walk', from: 0, to: 1 }] },
      frames: {},
    }
    expect(detectAtlasFormat(json)).toBe('aseprite')
  })

  it('treats a bare file with per-frame duration as Aseprite even without meta.app', () => {
    const json: AtlasJson = {
      meta: { size: { w: 1, h: 1 } },
      frames: {
        a: {
          frame: { x: 0, y: 0, w: 1, h: 1 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
          sourceSize: { w: 1, h: 1 },
          duration: 100,
        },
      },
    }
    expect(detectAtlasFormat(json)).toBe('aseprite')
  })
})

describe('buildTexturePackerJson', () => {
  it('emits meta.image (not meta.sources/animations), preserving frame passthrough', () => {
    const json = buildTexturePackerJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        {
          id: 'a',
          x: 0,
          y: 0,
          w: 30,
          h: 32,
          name: 'a',
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
        },
      ],
    })
    expect(json.meta.app).toBe('fl-sprite-atlas')
    expect(json.meta.image).toBe('hero.png')
    expect(json.meta).not.toHaveProperty('sources')
    expect(json.meta).not.toHaveProperty('animations')
    expect(json.frames.a?.rotated).toBe(true)
    expect(json.frames.a?.trimmed).toBe(true)
    expect(json.frames.a?.sourceSize).toEqual({ w: 32, h: 34 })
  })

  it('never forwards duration (Aseprite-only) or mesh (ours-only) even when the rect carries them', () => {
    const json = buildTexturePackerJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        {
          id: 'a',
          x: 0,
          y: 0,
          w: 16,
          h: 16,
          name: 'a',
          duration: 100,
          mesh: { verts: [[0, 0, 0, 0]], indices: [0] },
        },
      ],
    })
    expect(json.frames.a).not.toHaveProperty('duration')
    expect(json.frames.a).not.toHaveProperty('mesh')
  })

  it('a loaded TexturePacker fixture round-trips byte-identically through atlasToRects -> buildTexturePackerJson when untouched', () => {
    const original: AtlasJson = {
      meta: {
        app: 'https://www.codeandweb.com/texturepacker',
        image: 'hero.png',
        size: { w: 64, h: 64 },
        scale: '1',
      },
      frames: {
        a: {
          frame: { x: 0, y: 0, w: 30, h: 32 },
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
        },
      },
    }
    const rects = atlasToRects(original, () => 'id-0')
    const rebuilt = buildTexturePackerJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects,
    })
    expect(rebuilt.frames).toEqual(original.frames)
  })
})

describe('animationInputToFrameTag', () => {
  const orderedNames = ['idle', 'walk_0', 'walk_1', 'walk_2', 'jump']

  it('converts a forward-order animation into a contiguous forward tag', () => {
    const input: AnimationInput = {
      frames: ['walk_0', 'walk_1', 'walk_2'],
      fps: 10,
      loop: true,
      pingPong: false,
    }
    expect(animationInputToFrameTag('walk', input, orderedNames)).toEqual({
      name: 'walk',
      from: 1,
      to: 3,
      direction: 'forward',
    })
  })

  it('converts a reverse-order animation into a reverse tag', () => {
    const input: AnimationInput = {
      frames: ['walk_2', 'walk_1', 'walk_0'],
      fps: 10,
      loop: true,
      pingPong: false,
    }
    expect(animationInputToFrameTag('walk-reverse', input, orderedNames)).toEqual({
      name: 'walk-reverse',
      from: 1,
      to: 3,
      direction: 'reverse',
    })
  })

  it('collapses consecutive-repeat holds before matching a range', () => {
    const input: AnimationInput = {
      frames: ['walk_0', 'walk_0', 'walk_1', 'walk_2', 'walk_2'],
      fps: 10,
      loop: true,
      pingPong: false,
    }
    expect(animationInputToFrameTag('walk', input, orderedNames)?.direction).toBe('forward')
  })

  it('marks pingPong animations as pingpong direction', () => {
    const input: AnimationInput = {
      frames: ['walk_0', 'walk_1', 'walk_2'],
      fps: 10,
      loop: true,
      pingPong: true,
    }
    expect(animationInputToFrameTag('walk', input, orderedNames)?.direction).toBe('pingpong')
  })

  it('refuses (returns null) for a non-contiguous frame selection', () => {
    const input: AnimationInput = {
      frames: ['idle', 'walk_1', 'jump'],
      fps: 10,
      loop: true,
      pingPong: false,
    }
    expect(animationInputToFrameTag('scattered', input, orderedNames)).toBeNull()
  })

  it('refuses (returns null) for a scrambled (neither forward nor reverse) order within a contiguous range', () => {
    const input: AnimationInput = {
      frames: ['walk_1', 'walk_0', 'walk_2'],
      fps: 10,
      loop: true,
      pingPong: false,
    }
    expect(animationInputToFrameTag('scrambled', input, orderedNames)).toBeNull()
  })

  it('carries color/repeat/data passthrough onto the emitted tag', () => {
    const input: AnimationInput = {
      frames: ['walk_0', 'walk_1'],
      fps: 10,
      loop: true,
      pingPong: false,
      color: '#ff0000',
      repeat: '3',
      data: 'note',
    }
    expect(animationInputToFrameTag('walk', input, orderedNames)).toEqual({
      name: 'walk',
      from: 1,
      to: 2,
      direction: 'forward',
      color: '#ff0000',
      repeat: '3',
      data: 'note',
    })
  })
})

describe('buildAsepriteJson', () => {
  it('emits meta.image + meta.frameTags with per-frame duration, skipping unconvertible animations', () => {
    const json = buildAsepriteJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        { id: 'a', x: 0, y: 0, w: 16, h: 16, name: 'walk_0' },
        { id: 'b', x: 16, y: 0, w: 16, h: 16, name: 'walk_1' },
        { id: 'c', x: 32, y: 0, w: 16, h: 16, name: 'idle' },
      ],
      animations: {
        walk: { frames: ['walk_0', 'walk_1'], fps: 10, loop: true, pingPong: false },
        scattered: { frames: ['idle', 'walk_0'], fps: 10, loop: true, pingPong: false },
      },
    })
    expect(json.meta.image).toBe('hero.png')
    expect(json.meta).not.toHaveProperty('sources')
    expect(json.meta).not.toHaveProperty('animations')
    expect(json.meta.frameTags).toEqual([{ name: 'walk', from: 0, to: 1, direction: 'forward' }])
    expect(json.frames.walk_0?.duration).toBe(100)
    expect(json.frames.walk_1?.duration).toBe(100)
    expect(json.frames.idle?.duration).toBeUndefined()
  })

  it('never forwards vertices/verticesUV/triangles (TexturePacker-only) or mesh (ours-only) even when the rect carries them', () => {
    const json = buildAsepriteJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        {
          id: 'a',
          x: 0,
          y: 0,
          w: 16,
          h: 16,
          name: 'a',
          vertices: [[0, 0]],
          verticesUV: [[0, 0]],
          triangles: [[0, 1, 2]],
          mesh: { verts: [[0, 0, 0, 0]], indices: [0] },
        },
      ],
    })
    expect(json.frames.a).not.toHaveProperty('vertices')
    expect(json.frames.a).not.toHaveProperty('verticesUV')
    expect(json.frames.a).not.toHaveProperty('triangles')
    expect(json.frames.a).not.toHaveProperty('mesh')
  })

  it('a loaded Aseprite fixture round-trips through importAsepriteFrameTags -> buildAsepriteJson when untouched', () => {
    const original: AtlasJson = {
      meta: {
        app: 'http://www.aseprite.org/',
        image: 'hero.png',
        size: { w: 48, h: 16 },
        scale: '1',
        frameTags: [{ name: 'walk', from: 0, to: 2, direction: 'forward' }],
      },
      frames: {
        walk_0: {
          frame: { x: 0, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          duration: 100,
        },
        walk_1: {
          frame: { x: 16, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          duration: 100,
        },
        walk_2: {
          frame: { x: 32, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          duration: 100,
        },
      },
    }
    const rects = atlasToRects(
      original,
      (() => {
        let i = 0
        return () => `id-${i++}`
      })()
    )
    const animations = importAsepriteFrameTags(original)
    const rebuilt = buildAsepriteJson({
      image: { fileName: 'hero.png', width: 48, height: 16 },
      rects,
      animations,
    })
    expect(rebuilt.meta.frameTags).toEqual(original.meta.frameTags)
    expect(rebuilt.frames).toEqual(original.frames)
  })
})

// These prove format fidelity against the STRICT per-format schemas
// (packages/schemas/src/atlas/texturepacker.schema.json /
// aseprite.schema.json) — real-world shapes that reject our own
// extensions. Our own permissive superset schema (schema.json, exercised
// via validator.test.ts's fixture sweep) would happily pass output that
// leaked `meta.sources`/`meta.animations`/`Frame.mesh` into a supposedly
// TexturePacker- or Aseprite-shaped export; the strict schemas are the
// only thing that actually catches that.
describe('strict format-schema fidelity', () => {
  it('buildTexturePackerJson output validates against the strict TexturePacker schema, including rotation/trim/pivot/polygon', () => {
    const json = buildTexturePackerJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        {
          id: 'a',
          x: 0,
          y: 0,
          w: 30,
          h: 32,
          name: 'a',
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
          pivot: { x: 0.5, y: 0.5 },
          vertices: [
            [0, 0],
            [32, 0],
            [32, 32],
          ],
          verticesUV: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          triangles: [[0, 1, 2]],
        },
      ],
    })
    assertValidTexturePackerAtlas(json)
  })

  it('buildAsepriteJson output validates against the strict Aseprite schema, including frameTags + per-frame duration', () => {
    const json = buildAsepriteJson({
      image: { fileName: 'hero.png', width: 48, height: 16 },
      rects: [
        { id: 'a', x: 0, y: 0, w: 16, h: 16, name: 'walk_0' },
        { id: 'b', x: 16, y: 0, w: 16, h: 16, name: 'walk_1' },
        { id: 'c', x: 32, y: 0, w: 16, h: 16, name: 'walk_2' },
      ],
      animations: {
        walk: { frames: ['walk_0', 'walk_1', 'walk_2'], fps: 10, loop: true, pingPong: false },
      },
    })
    assertValidAsepriteAtlas(json)
  })
})
