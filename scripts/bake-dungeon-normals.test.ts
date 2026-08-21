import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashDescriptor, readPngTextChunk } from '../packages/bake/src/sidecar'
import { buildDungeonNormalDescriptor, type LDtkProject, type LDtkTilesetDef } from './bake-dungeon-normals'

const ROOT = resolve(import.meta.dirname, '..')
const VARIANTS = ['react', 'three'] as const

function lightingAsset(variant: (typeof VARIANTS)[number], path: string): string {
  return join(ROOT, 'examples', variant, 'lighting', 'public', path)
}

function readFlatlandHash(path: string): string {
  const bytes = readFileSync(path)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const text = readPngTextChunk(buffer, 'flatland')
  expect(text, `${path} must include flatland sidecar metadata`).not.toBeNull()
  return (JSON.parse(text!) as { hash: string }).hash
}

describe('lighting example dungeon normal sidecars', () => {
  it('keeps the bake grid formula aligned with LDtkLoader for spaced tilesets', () => {
    const tileset: LDtkTilesetDef = {
      uid: 1,
      identifier: 'Dungeon_Tileset',
      pxWid: 32,
      pxHei: 16,
      tileGridSize: 16,
      spacing: 2,
      padding: 1,
      customData: [],
    }

    expect(buildDungeonNormalDescriptor({ defs: { tilesets: [tileset] } }).regions).toEqual([
      { x: 1, y: 1, w: 16, h: 16 },
      { x: 19, y: 1, w: 16, h: 16 },
    ])
  })

  it('matches the runtime descriptor and embedded PNG hash in both variants', () => {
    const project = JSON.parse(readFileSync(lightingAsset('react', 'maps/dungeon.ldtk'), 'utf8')) as LDtkProject
    const expected = buildDungeonNormalDescriptor(project)
    const expectedHash = hashDescriptor(expected)

    for (const variant of VARIANTS) {
      const descriptorPath = lightingAsset(variant, 'sprites/Dungeon_Tileset.normal.json')
      const sidecarPath = lightingAsset(variant, 'sprites/Dungeon_Tileset.normal.png')
      expect(JSON.parse(readFileSync(descriptorPath, 'utf8'))).toEqual(expected)
      expect(readFlatlandHash(sidecarPath)).toBe(expectedHash)
    }
  })

  it.each([
    'maps/dungeon.ldtk',
    'sprites/Dungeon_Tileset.png',
    'sprites/Dungeon_Tileset.normal.json',
    'sprites/Dungeon_Tileset.normal.png',
  ])('keeps paired asset %s byte-identical', (path) => {
    expect(readFileSync(lightingAsset('react', path))).toEqual(readFileSync(lightingAsset('three', path)))
  })
})
