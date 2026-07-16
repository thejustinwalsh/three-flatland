import type { SpriteFrame } from 'three-flatland/react'
import type { BiomeName } from '../biomes'

const COLUMNS = 16
const ROWS = 11
const TILE_SIZE = 16

const BIOME_ROW = {
  topsoil: 0,
  'deep-dirt': 1,
  stoneworks: 2,
  'crystal-caverns': 3,
  core: 4,
} satisfies Record<BiomeName, number>

// The concept board lays its 15 edge examples out for readability, not in
// binary N/S/E/W order. Translate the engine mask to that presentation order.
const MASK_TO_ART = [11, 14, 2, 14, 13, 12, 3, 6, 13, 12, 3, 6, 8, 10, 0, 15] as const
const FLIPPED_MASKS = new Set([8, 9, 10, 11])

function atlasFrame(name: string, row: number, column: number): SpriteFrame {
  return {
    name,
    x: column / COLUMNS,
    y: 1 - (row + 1) / ROWS,
    width: 1 / COLUMNS,
    height: 1 / ROWS,
    sourceWidth: TILE_SIZE,
    sourceHeight: TILE_SIZE,
  }
}

function tileFrames(biome: BiomeName, kind: 'soil' | 'stone'): SpriteFrame[] {
  const row = BIOME_ROW[biome] + (kind === 'stone' ? 5 : 0)
  return Array.from({ length: 16 }, (_, mask) => atlasFrame(`${biome}-${kind}-${mask}`, row, mask))
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
  return SOIL_FRAMES[biome][MASK_TO_ART[mask & 0xf] ?? 15]!
}

export function stoneFrame(biome: BiomeName, mask: number): SpriteFrame {
  return STONE_FRAMES[biome][MASK_TO_ART[mask & 0xf] ?? 15]!
}

export function tileFrameFlipsX(mask: number): boolean {
  return FLIPPED_MASKS.has(mask & 0xf)
}

export function fixtureFrame(kind: number, variation = 0): SpriteFrame {
  const base = kind === 0 ? 0 : kind === 1 ? 4 : kind === 2 ? 8 : kind === 3 ? 12 : 13
  const column = kind <= 2 ? base + (variation & 3) : base
  return FIXTURE_FRAMES[column]!
}

export function explosiveFrame(): SpriteFrame {
  return EXPLOSIVE_FRAME
}
