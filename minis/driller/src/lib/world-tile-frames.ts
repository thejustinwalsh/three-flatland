import type { SpriteFrame } from 'three-flatland/react'
import type { BiomeName } from '../biomes'
import { AUTOTILE_FRAME_COUNT } from './autotile'

const COLUMNS = AUTOTILE_FRAME_COUNT
const ROWS = 11
const TILE_SIZE = 16
const SLOT_PADDING = 2
const SLOT_SIZE = TILE_SIZE + SLOT_PADDING * 2

const BIOME_ROW = {
  topsoil: 0,
  'deep-dirt': 1,
  stoneworks: 2,
  'crystal-caverns': 3,
  core: 4,
} satisfies Record<BiomeName, number>

function atlasFrame(name: string, row: number, column: number): SpriteFrame {
  const atlasWidth = COLUMNS * SLOT_SIZE
  const atlasHeight = ROWS * SLOT_SIZE
  return {
    name,
    x: (column * SLOT_SIZE + SLOT_PADDING) / atlasWidth,
    y: 1 - (row * SLOT_SIZE + SLOT_PADDING + TILE_SIZE) / atlasHeight,
    width: TILE_SIZE / atlasWidth,
    height: TILE_SIZE / atlasHeight,
    sourceWidth: TILE_SIZE,
    sourceHeight: TILE_SIZE,
  }
}

function tileFrames(biome: BiomeName, kind: 'soil' | 'stone'): SpriteFrame[] {
  const row = BIOME_ROW[biome] + (kind === 'stone' ? 5 : 0)
  return Array.from({ length: AUTOTILE_FRAME_COUNT }, (_, index) =>
    atlasFrame(`${biome}-${kind}-${index}`, row, index)
  )
}

const SOIL_FRAMES: Record<BiomeName, SpriteFrame[]> = {
  topsoil: tileFrames('topsoil', 'soil'),
  'deep-dirt': tileFrames('deep-dirt', 'soil'),
  stoneworks: tileFrames('stoneworks', 'soil'),
  'crystal-caverns': tileFrames('crystal-caverns', 'soil'),
  core: tileFrames('core', 'soil'),
}

const STONE_FRAMES: Record<BiomeName, SpriteFrame[]> = {
  topsoil: tileFrames('topsoil', 'stone'),
  'deep-dirt': tileFrames('deep-dirt', 'stone'),
  stoneworks: tileFrames('stoneworks', 'stone'),
  'crystal-caverns': tileFrames('crystal-caverns', 'stone'),
  core: tileFrames('core', 'stone'),
}

const FIXTURE_FRAMES = Array.from({ length: 16 }, (_, variant) =>
  atlasFrame(`fixture-${variant}`, 10, variant)
)
const EXPLOSIVE_FRAME = atlasFrame('explosive', 10, 15)

export function soilFrame(biome: BiomeName, mask: number): SpriteFrame {
  return SOIL_FRAMES[biome][mask % AUTOTILE_FRAME_COUNT]!
}

export function stoneFrame(biome: BiomeName, mask: number): SpriteFrame {
  return STONE_FRAMES[biome][mask % AUTOTILE_FRAME_COUNT]!
}

export function fixtureFrame(kind: number, variation = 0): SpriteFrame {
  const base = kind === 0 ? 0 : kind === 1 ? 4 : kind === 2 ? 8 : kind === 3 ? 12 : 13
  const column = kind <= 2 ? base + (variation & 3) : base
  return FIXTURE_FRAMES[column]!
}

export function explosiveFrame(): SpriteFrame {
  return EXPLOSIVE_FRAME
}
