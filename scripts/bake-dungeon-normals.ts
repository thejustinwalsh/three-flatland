// One-off: bake the lighting-example dungeon tileset's normal map from
// the LDtk-tagged tile custom data.
//
// Reads tile customData from public/maps/dungeon.ldtk, synthesizes a
// descriptor via tilesetToRegions, and runs @three-flatland/normals
// bakeNormalMapFile on the resulting regions.
//
// Usage:
//   tsx scripts/bake-dungeon-normals.ts
//
// Output: examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bakeNormalMapFile } from '@three-flatland/normals/node'
import type { NormalSourceDescriptor } from '@three-flatland/normals'
import {
  tilesetToRegions,
  type TileNormalCustomData,
  type TilesetCell,
} from 'three-flatland/loaders/normalDescriptor'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const LDTK_PATH = resolve(
  ROOT,
  'examples/react/lighting/public/maps/dungeon.ldtk'
)
const TILESET_PATH = resolve(
  ROOT,
  'examples/react/lighting/public/sprites/Dungeon_Tileset.png'
)

interface LDtkTilesetDef {
  uid: number
  identifier: string
  pxWid: number
  pxHei: number
  tileGridSize: number
  spacing: number
  padding: number
  customData: Array<{ tileId: number; data: string }>
}

interface LDtkProject {
  defs: { tilesets: LDtkTilesetDef[] }
}

function main(): void {
  const project = JSON.parse(readFileSync(LDTK_PATH, 'utf8')) as LDtkProject
  const tileset = project.defs.tilesets.find((t) => t.identifier === 'Dungeon_Tileset')
  if (!tileset) throw new Error('Dungeon_Tileset not found in LDtk project')

  const { pxWid, pxHei, tileGridSize, spacing, padding, customData } = tileset
  const cols = Math.floor((pxWid + spacing) / (tileGridSize + spacing))
  const rows = Math.floor((pxHei + spacing) / (tileGridSize + spacing))

  // Parse customData into a map keyed by tileId.
  const metaById = new Map<number, TileNormalCustomData>()
  for (const entry of customData) {
    try {
      metaById.set(entry.tileId, JSON.parse(entry.data) as TileNormalCustomData)
    } catch {
      console.warn(`skipping tileId ${entry.tileId}: invalid JSON in customData`)
    }
  }

  // Walk the grid, emit a cell per tile with (optional) meta.
  const cells: TilesetCell[] = []
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const tileId = gy * cols + gx
      const x = padding + gx * (tileGridSize + spacing)
      const y = padding + gy * (tileGridSize + spacing)
      cells.push({
        x,
        y,
        w: tileGridSize,
        h: tileGridSize,
        meta: metaById.get(tileId),
      })
    }
  }

  const regions = tilesetToRegions(cells)
  const descriptor: NormalSourceDescriptor = {
    version: 1,
    pitch: Math.PI / 4,
    regions,
  }

  // Dump descriptor next to the tileset for inspection + reruns.
  const descriptorPath = TILESET_PATH.replace(/\.png$/, '.normal.json')
  writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2) + '\n')
  console.log(`wrote ${descriptorPath} (${regions.length} regions)`)

  // Bake.
  const outPath = bakeNormalMapFile(TILESET_PATH, descriptor)
  console.log(`baked ${outPath}`)
}

main()
