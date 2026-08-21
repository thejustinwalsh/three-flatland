// One-off: bake the lighting-example dungeon tileset's normal map from
// the LDtk-tagged tile custom data.
//
// Reads tile customData from public/maps/dungeon.ldtk, synthesizes a
// descriptor via tilesetToRegions, and runs @three-flatland/normals
// bakeNormalMapFile on the resulting regions.
//
// Usage:
//   node scripts/bake-dungeon-normals.ts
//
// Output: the paired React and Three.js lighting-example normal sidecars

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bakeNormalMapFile } from '@three-flatland/normals/node'
import type { NormalSourceDescriptor } from '@three-flatland/normals'
import { buildTilesetGrid, tilesetToRegions, type TileNormalCustomData } from 'three-flatland/loaders/normalDescriptor'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const __dirname = dirname(SCRIPT_PATH)
const ROOT = resolve(__dirname, '..')
const LDTK_PATH = resolve(ROOT, 'examples/react/lighting/public/maps/dungeon.ldtk')
const TILESET_PATHS = ['react', 'three'].map((variant) =>
  resolve(ROOT, `examples/${variant}/lighting/public/sprites/Dungeon_Tileset.png`)
)

export interface LDtkTilesetDef {
  uid: number
  identifier: string
  pxWid: number
  pxHei: number
  tileGridSize: number
  spacing: number
  padding: number
  __cWid: number
  __cHei: number
  customData: Array<{ tileId: number; data: string }>
}

export interface LDtkProject {
  defs: { tilesets: LDtkTilesetDef[] }
}

export function buildDungeonNormalDescriptor(project: LDtkProject): NormalSourceDescriptor {
  const tileset = project.defs.tilesets.find((t) => t.identifier === 'Dungeon_Tileset')
  if (!tileset) throw new Error('Dungeon_Tileset not found in LDtk project')

  const { pxWid, pxHei, tileGridSize, spacing, padding, __cWid, __cHei, customData } = tileset
  // Parse customData into a map keyed by tileId.
  const metaById = new Map<number, TileNormalCustomData>()
  for (const entry of customData) {
    try {
      metaById.set(entry.tileId, JSON.parse(entry.data) as TileNormalCustomData)
    } catch {
      console.warn(`skipping tileId ${entry.tileId}: invalid JSON in customData`)
    }
  }

  const { cells } = buildTilesetGrid(
    {
      imageWidth: pxWid,
      imageHeight: pxHei,
      tileWidth: tileGridSize,
      tileHeight: tileGridSize,
      spacing,
      padding,
      columns: __cWid,
      rows: __cHei,
    },
    (tileId) => metaById.get(tileId)
  )

  return { regions: tilesetToRegions(cells) }
}

function main(): void {
  const project = JSON.parse(readFileSync(LDTK_PATH, 'utf8')) as LDtkProject
  const descriptor = buildDungeonNormalDescriptor(project)
  const regionCount = descriptor.regions?.length ?? 0

  for (const tilesetPath of TILESET_PATHS) {
    // Dump the descriptor next to each paired tileset for inspection + reruns.
    const descriptorPath = tilesetPath.replace(/\.png$/, '.normal.json')
    writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2) + '\n')
    console.log(`wrote ${descriptorPath} (${regionCount} regions)`)

    const outPath = bakeNormalMapFile(tilesetPath, descriptor)
    console.log(`baked ${outPath}`)
  }
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) main()
