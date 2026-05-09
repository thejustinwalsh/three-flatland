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
  /**
   * Wide horizontal tunnel count range per chunk [min, max]. Tunnels
   * are 1–2 rows tall and span most of the chunk's width; they
   * create overhangs above/below that the cantilever-sag system can
   * pick up. Topsoil uses these heavily to introduce the "sag"
   * concept early without high crush risk.
   */
  tunnelCount: [number, number]
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
export const WORLD_BODY_ROWS = 150
/**
 * Tuned so plenty of gems escape the top of the playfield before the
 * driller lands. Driller free-fall ≈ 245 ms/cell, gems ≈ 320 ms/cell;
 * over 55 void rows the driller outruns gems by roughly 14 rows,
 * which is more than the 8-row playfield-top offset, so the back
 * portion of the gem column is reliably consumed by the death tween.
 */
export const WORLD_VOID_ROWS = 55
export const WORLD_LENGTH_ROWS = WORLD_BODY_ROWS + WORLD_VOID_ROWS

export const BIOMES: Biome[] = [
  {
    name: 'topsoil',
    minDepth: 0,
    maxDepth: WORLD_BODY_ROWS,
    caveCount: [2, 3],
    tunnelCount: [3, 5],
    // Mario-progression: topsoil leans HEAVY on fixtures so the
    // player learns the world is mostly stable. With MAX_REACH=6
    // and fixtures-up-only-as-anchor, we need ~1 fixture per 6 row
    // band to keep the world from collapsing on stream-in. Bumped
    // from [1,3] → [4,6] for the new diffusion topology.
    fixtureCount: [4, 6],
    fixtureKinds: ['bone'],
    gemCount: [4, 6],
    gemPalette: ['emerald', 'topaz', 'ruby', 'amethyst'],
    soilDensity: 0.65,
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
    caveCount: [3, 4],
    tunnelCount: [2, 3],
    fixtureCount: [4, 6],
    fixtureKinds: ['bone'],
    gemCount: [4, 6],
    gemPalette: ['emerald', 'topaz', 'ruby'],
    soilDensity: 0.7,
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
    caveCount: [3, 5],
    tunnelCount: [1, 2],
    // Mid-progression: rocks become a bigger contributor to stability
    // (they conduct anchor distance). Fixture density tapers slightly.
    fixtureCount: [3, 5],
    fixtureKinds: ['stone-pillar', 'bone', 'mushroom'],
    gemCount: [4, 6],
    gemPalette: ['emerald', 'topaz', 'ruby', 'amethyst'],
    soilDensity: 0.6,
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
    caveCount: [4, 6],
    tunnelCount: [1, 2],
    // Late progression: caves dominate, fixtures rarer — chaos rises.
    // Rocks (which conduct anchor distance) carry more of the stability
    // load. Players see frequent sag cascades.
    fixtureCount: [3, 5],
    fixtureKinds: ['crystal', 'stone-pillar'],
    gemCount: [3, 5],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.45,
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
    caveCount: [5, 7],
    tunnelCount: [1, 2],
    // Endgame: chaos. Sparser fixtures, dense caves, lots of rocks.
    // The whole field churns; player has to dig with constant
    // awareness of cascading collapses. Mario "game in full swing".
    fixtureCount: [3, 5],
    fixtureKinds: ['crystal'],
    gemCount: [2, 3],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.35,
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
