import { describe, expect, it } from 'vitest'
import {
  normalJsonPath,
  normalPngPath,
  pngPathFromNormalJson,
  sourcePngFromNormalPng,
} from './paths'

describe('normalJsonPath', () => {
  it('replaces a .png extension with .normal.json', () => {
    expect(normalJsonPath('/a/b/Dungeon_Tileset.png')).toBe('/a/b/Dungeon_Tileset.normal.json')
  })

  it('is case-insensitive on the extension', () => {
    expect(normalJsonPath('/a/b/Tile.PNG')).toBe('/a/b/Tile.normal.json')
  })

  it('only touches the trailing extension, not the whole filename', () => {
    expect(normalJsonPath('/a/b/pngcase.png')).toBe('/a/b/pngcase.normal.json')
  })
})

describe('normalPngPath', () => {
  it('replaces a .png extension with .normal.png', () => {
    expect(normalPngPath('/a/b/Dungeon_Tileset.png')).toBe('/a/b/Dungeon_Tileset.normal.png')
  })

  it('is case-insensitive on the extension', () => {
    expect(normalPngPath('/a/b/Tile.PNG')).toBe('/a/b/Tile.normal.png')
  })
})

describe('pngPathFromNormalJson', () => {
  it('replaces a .normal.json sidecar path with its source .png path', () => {
    expect(pngPathFromNormalJson('/a/b/Dungeon_Tileset.normal.json')).toBe(
      '/a/b/Dungeon_Tileset.png'
    )
  })

  it('is case-insensitive on the extension', () => {
    expect(pngPathFromNormalJson('/a/b/Tile.NORMAL.JSON')).toBe('/a/b/Tile.png')
  })

  it('is the exact inverse of normalJsonPath — round-trips through both directions', () => {
    const png = '/a/b/Dungeon_Tileset.png'
    expect(pngPathFromNormalJson(normalJsonPath(png))).toBe(png)
  })

  it('returns null for a path that is not a .normal.json sidecar', () => {
    expect(pngPathFromNormalJson('/a/b/Dungeon_Tileset.png')).toBeNull()
    expect(pngPathFromNormalJson('/a/b/Dungeon_Tileset.atlas.json')).toBeNull()
    expect(pngPathFromNormalJson('/a/b/plain.json')).toBeNull()
  })
})

describe('sourcePngFromNormalPng', () => {
  it('maps a baked X.normal.png back to its source X.png', () => {
    expect(sourcePngFromNormalPng('/a/b/Dungeon_Tileset.normal.png')).toBe(
      '/a/b/Dungeon_Tileset.png'
    )
  })

  it('is case-insensitive on the suffix', () => {
    expect(sourcePngFromNormalPng('/a/b/Tile.NORMAL.PNG')).toBe('/a/b/Tile.png')
  })

  it('returns null for a plain source .png — a source is not a derived normal map', () => {
    expect(sourcePngFromNormalPng('/a/b/Dungeon_Tileset.png')).toBeNull()
  })

  it('returns null for non-normal-png paths', () => {
    expect(sourcePngFromNormalPng('/a/b/Tile.normal.json')).toBeNull()
    expect(sourcePngFromNormalPng('/a/b/plain.jpg')).toBeNull()
  })

  it('is the exact inverse of normalPngPath — round-trips through both directions', () => {
    const png = '/a/b/Dungeon_Tileset.png'
    expect(sourcePngFromNormalPng(normalPngPath(png))).toBe(png)
  })
})
