import type { GemColor } from './atlas-regions'

export type BiomeName = 'topsoil' | 'deep-dirt' | 'stoneworks' | 'crystal-caverns' | 'core'

export type Tint = readonly [number, number, number]

export interface Biome {
  name: BiomeName
  /** Inclusive lower depth bound (cells). */
  minDepth: number
  /** Exclusive upper depth bound (cells). */
  maxDepth: number
  /** Pre-cut cave count range per chunk [min, max]. */
  caveCount: [number, number]
  /** Fixture count range per chunk [min, max]. */
  fixtureCount: [number, number]
  fixtureKinds: ('bone' | 'mushroom' | 'crystal' | 'stone-pillar')[]
  /** Gem count range per chunk [min, max]. */
  gemCount: [number, number]
  gemPalette: GemColor[]
  /** Soil density during base fill (0..1). */
  soilDensity: number
  /**
   * Tile-render palette for this biome. The renderer picks one of these
   * for each SOIL cell based on its autotile frame index — `grass` for
   * top-exposed cells, `edge` for run-of-the-mill soil, `deep` for the
   * fully-encased interior. Stones/rocks blend toward `stone`.
   */
  palette: { grass: Tint; edge: Tint; deep: Tint; stone: Tint }
  /**
   * Two CSS colour stops the Background component blends between for
   * the parallax sky behind the play area. Order = top-to-bottom.
   */
  bgGradient: [string, string]
}

/**
 * Five depth bands. Lower bands reuse upper-band fixtures so transitions
 * feel continuous. Crystal-caverns + core lean on the lighting system.
 */
/**
 * Each "world" is a single-biome layer: one solid biome body, then a
 * pure-AIR void band at its bottom. The driller drills through the
 * body, hits the void, free-falls (with lateral steering for gem
 * snags) to the surface of the NEXT world, where a different biome
 * takes over. Biomes therefore only change AFTER a free fall — never
 * mid-descent through a single world.
 */
export const WORLD_BODY_ROWS = 100
/**
 * Long enough that the driller — falling at ~245 ms/cell — outpaces
 * gems (320 ms/cell) by enough rows that a meaningful share of them
 * scroll off the top of the screen and despawn before the driller
 * lands on the next biome's surface. Previously 20 rows; 35 lets
 * roughly a third of the void's gems get away from the player.
 */
export const WORLD_VOID_ROWS = 35
export const WORLD_LENGTH_ROWS = WORLD_BODY_ROWS + WORLD_VOID_ROWS

export const BIOMES: Biome[] = [
  {
    name: 'topsoil',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [0, 0],
    fixtureCount: [0, 0],
    fixtureKinds: [],
    gemCount: [1, 2],
    gemPalette: ['emerald'],
    soilDensity: 0.95,
    palette: {
      grass: [0.37, 0.66, 0.28],
      edge: [0.42, 0.29, 0.17],
      deep: [0.36, 0.25, 0.14],
      stone: [0.44, 0.44, 0.48],
    },
    bgGradient: ['#1a1411', '#3a2a1a'],
  },
  {
    name: 'deep-dirt',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [1, 2],
    fixtureCount: [0, 1],
    fixtureKinds: ['bone'],
    gemCount: [3, 4],
    gemPalette: ['emerald', 'topaz', 'ruby'],
    soilDensity: 0.92,
    palette: {
      grass: [0.32, 0.45, 0.22],
      edge: [0.34, 0.21, 0.13],
      deep: [0.26, 0.16, 0.10],
      stone: [0.36, 0.36, 0.42],
    },
    bgGradient: ['#0f0a09', '#2a1a14'],
  },
  {
    name: 'stoneworks',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [2, 3],
    fixtureCount: [1, 3],
    fixtureKinds: ['stone-pillar', 'bone', 'mushroom'],
    gemCount: [4, 6],
    gemPalette: ['emerald', 'topaz', 'ruby', 'amethyst'],
    soilDensity: 0.78,
    palette: {
      grass: [0.30, 0.40, 0.45],
      edge: [0.40, 0.40, 0.46],
      deep: [0.30, 0.30, 0.36],
      stone: [0.55, 0.55, 0.60],
    },
    bgGradient: ['#0c0d12', '#202530'],
  },
  {
    name: 'crystal-caverns',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [3, 4],
    fixtureCount: [2, 3],
    fixtureKinds: ['crystal', 'stone-pillar'],
    gemCount: [3, 5],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.5,
    palette: {
      grass: [0.55, 0.40, 0.85],
      edge: [0.40, 0.28, 0.55],
      deep: [0.26, 0.18, 0.40],
      stone: [0.62, 0.45, 0.85],
    },
    bgGradient: ['#0a0820', '#1c1240'],
  },
  {
    name: 'core',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [4, 5],
    fixtureCount: [2, 3],
    fixtureKinds: ['crystal'],
    gemCount: [2, 3],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.3,
    palette: {
      grass: [0.85, 0.40, 0.20],
      edge: [0.50, 0.20, 0.12],
      deep: [0.30, 0.10, 0.06],
      stone: [0.65, 0.30, 0.20],
    },
    bgGradient: ['#1a0606', '#3a0e08'],
  },
]

/**
 * Lookup the biome for an absolute cell depth. The world is laid out
 * as a sequence of single-biome layers separated by free-fall void
 * bands; biomes only change AFTER the driller has fallen through a
 * void, never within one layer. Each layer is `WORLD_LENGTH_ROWS`
 * long; the BIOMES array provides the palette pool, cycled by the
 * world index (so far enough down the player loops back through the
 * same biomes in the same order).
 */
export function biomeAt(depthM: number): Biome {
  const worldIndex = Math.max(0, Math.floor(depthM / WORLD_LENGTH_ROWS))
  return BIOMES[worldIndex % BIOMES.length]!
}

/**
 * Position within the current world: 0 .. WORLD_LENGTH_ROWS-1. Used
 * to tell whether the driller is in solid biome body or the void
 * band below it.
 */
export function rowInWorld(depthM: number): number {
  const adj = ((depthM % WORLD_LENGTH_ROWS) + WORLD_LENGTH_ROWS) % WORLD_LENGTH_ROWS
  return adj
}

/** True if `depthM` is inside the void band at the bottom of its world. */
export function isFreeFall(depthM: number): boolean {
  return rowInWorld(depthM) >= WORLD_BODY_ROWS
}

/**
 * Smoothly blend the palette between two biomes within a transition
 * zone — used by the renderer + Background to fade between layers
 * instead of hard-snapping. `t` is the lerp parameter (0 = `from`,
 * 1 = `to`).
 */
export function lerpTint(from: Tint, to: Tint, t: number): Tint {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ]
}
