import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashDescriptor, readPngTextChunk } from '@three-flatland/bake'
import { buildDungeonNormalDescriptor, type LDtkProject, type LDtkTilesetDef } from './bake-dungeon-normals'

const ROOT = resolve(import.meta.dirname, '..')
const VARIANTS = ['react', 'three'] as const
const DUNGEON_EXAMPLES = ['lighting', 'radiance-dungeon'] as const

function dungeonAsset(
  example: (typeof DUNGEON_EXAMPLES)[number],
  variant: (typeof VARIANTS)[number],
  path: string
): string {
  return join(ROOT, 'examples', variant, example, 'public', path)
}

function readFlatlandHash(path: string): string {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const text = readPngTextChunk(buffer, 'flatland')
  expect(text, `${path} must include flatland sidecar metadata`).not.toBeNull()
  return (JSON.parse(text!) as { hash: string }).hash
}

describe('dungeon example normal sidecars', () => {
  it('keeps the bake grid formula aligned with LDtkLoader for spaced tilesets', () => {
    const tileset: LDtkTilesetDef = {
      uid: 1,
      identifier: 'Dungeon_Tileset',
      pxWid: 36,
      pxHei: 36,
      tileGridSize: 16,
      spacing: 2,
      padding: 1,
      __cWid: 2,
      __cHei: 2,
      customData: [],
    }

    expect(buildDungeonNormalDescriptor({ defs: { tilesets: [tileset] } }).regions).toEqual([
      { x: 1, y: 1, w: 16, h: 16 },
      { x: 19, y: 1, w: 16, h: 16 },
      { x: 1, y: 19, w: 16, h: 16 },
      { x: 19, y: 19, w: 16, h: 16 },
    ])
  })

  it('matches each runtime descriptor and embedded PNG hash in both variants', () => {
    for (const example of DUNGEON_EXAMPLES) {
      const project = JSON.parse(
        readFileSync(dungeonAsset(example, 'react', 'maps/dungeon.ldtk'), 'utf8')
      ) as LDtkProject
      const expected = buildDungeonNormalDescriptor(project)
      const expectedHash = hashDescriptor(expected)

      for (const variant of VARIANTS) {
        const descriptorPath = dungeonAsset(example, variant, 'sprites/Dungeon_Tileset.normal.json')
        const sidecarPath = dungeonAsset(example, variant, 'sprites/Dungeon_Tileset.normal.png')
        expect(JSON.parse(readFileSync(descriptorPath, 'utf8'))).toEqual(expected)
        expect(readFlatlandHash(sidecarPath)).toBe(expectedHash)
      }
    }
  })

  it('keeps every paired dungeon asset byte-identical', () => {
    for (const example of DUNGEON_EXAMPLES) {
      for (const path of [
        'maps/dungeon.ldtk',
        'sprites/Dungeon_Tileset.png',
        'sprites/Dungeon_Tileset.normal.json',
        'sprites/Dungeon_Tileset.normal.png',
      ]) {
        expect(readFileSync(dungeonAsset(example, 'react', path))).toEqual(
          readFileSync(dungeonAsset(example, 'three', path))
        )
      }
    }
  })
})
