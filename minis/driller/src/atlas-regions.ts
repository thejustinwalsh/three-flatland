import type { BiomeName } from './biomes'

/**
 * Atlas region map — named (x, y, w, h) rectangles in the source tileset PNG.
 *
 * **Status: SCAFFOLD with PLACEHOLDER coordinates.** Real coordinates need
 * to be measured from `src/assets/tileset.png` (1536×1024). Until the
 * follow-up sub-issue lands, the runtime renders solid-color placeholder
 * sprites (see `materials.ts`) so simulation work can proceed.
 *
 * To dial in: drop a `<DebugAtlas />` overlay into the dev App that draws
 * the source PNG with semi-transparent rectangles for each region; iterate
 * coordinates until they bound the right art.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * SOIL autotile rows — one row per biome, 16 columns for the 16 mask
 * variants (0..15). Frame stride is 16 px horizontally per the asset.
 */
export const SOIL_ROWS: Record<BiomeName, Rect> = {
  topsoil: { x: 0, y: 0, w: 256, h: 16 },
  'deep-dirt': { x: 0, y: 16, w: 256, h: 16 },
  stoneworks: { x: 0, y: 32, w: 256, h: 16 },
  'crystal-caverns': { x: 0, y: 48, w: 256, h: 16 },
  core: { x: 0, y: 64, w: 256, h: 16 },
}

/** STONE anchor variants (4 expected per asset legend). */
export const STONE_VARIANTS: Rect[] = [
  { x: 0, y: 80, w: 16, h: 16 },
  { x: 16, y: 80, w: 16, h: 16 },
  { x: 32, y: 80, w: 16, h: 16 },
  { x: 48, y: 80, w: 16, h: 16 },
]

/** Fixture variants (anchors that block digging; visual-only diversity). */
export const FIXTURE_REGIONS = {
  bone: { x: 0, y: 96, w: 32, h: 32 },
  mushroom: { x: 32, y: 96, w: 32, h: 32 },
  crystal: { x: 64, y: 96, w: 32, h: 32 },
} as const

export type GemColor = 'emerald' | 'topaz' | 'ruby' | 'amethyst'
export type GemSize = 'small' | 'medium' | 'large' | 'huge'

/** 4 colors × 4 sizes; index by [color][size]. */
export const GEM_REGIONS: Record<GemColor, Record<GemSize, Rect>> = {
  emerald: {
    small: { x: 0, y: 144, w: 8, h: 8 },
    medium: { x: 16, y: 144, w: 12, h: 12 },
    large: { x: 32, y: 144, w: 16, h: 16 },
    huge: { x: 48, y: 144, w: 20, h: 20 },
  },
  topaz: {
    small: { x: 0, y: 160, w: 8, h: 8 },
    medium: { x: 16, y: 160, w: 12, h: 12 },
    large: { x: 32, y: 160, w: 16, h: 16 },
    huge: { x: 48, y: 160, w: 20, h: 20 },
  },
  ruby: {
    small: { x: 0, y: 176, w: 8, h: 8 },
    medium: { x: 16, y: 176, w: 12, h: 12 },
    large: { x: 32, y: 176, w: 16, h: 16 },
    huge: { x: 48, y: 176, w: 20, h: 20 },
  },
  amethyst: {
    small: { x: 0, y: 192, w: 8, h: 8 },
    medium: { x: 16, y: 192, w: 12, h: 12 },
    large: { x: 32, y: 192, w: 16, h: 16 },
    huge: { x: 48, y: 192, w: 20, h: 20 },
  },
}

/** Driller animation strips — frames stride by 16 px horizontally. */
export const DRILLER_ANIMS = {
  idle: { rect: { x: 0, y: 224, w: 64, h: 16 }, frames: 4 },
  walk: { rect: { x: 64, y: 224, w: 64, h: 16 }, frames: 4 },
  drillDown: { rect: { x: 0, y: 240, w: 64, h: 16 }, frames: 4 },
  drillUp: { rect: { x: 64, y: 240, w: 64, h: 16 }, frames: 4 },
  drillLeft: { rect: { x: 0, y: 256, w: 64, h: 16 }, frames: 4 },
  drillRight: { rect: { x: 64, y: 256, w: 64, h: 16 }, frames: 4 },
  trip: { rect: { x: 0, y: 272, w: 32, h: 16 }, frames: 2 },
  dodge: { rect: { x: 32, y: 272, w: 32, h: 16 }, frames: 2 },
  fall: { rect: { x: 0, y: 288, w: 64, h: 16 }, frames: 4 },
  ghost: { rect: { x: 64, y: 288, w: 48, h: 16 }, frames: 3 },
} as const

/** Title-attract art (full-mode title screen). */
export const TITLE_ART: Rect = { x: 0, y: 320, w: 256, h: 96 }
