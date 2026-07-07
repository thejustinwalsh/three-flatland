import { describe, expect, it } from 'vitest'
import { normalJsonPath, normalPngPath } from './paths'

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
