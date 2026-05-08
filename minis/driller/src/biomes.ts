import type { GemColor } from './atlas-regions'

export type BiomeName = 'topsoil' | 'deep-dirt' | 'stoneworks' | 'crystal-caverns' | 'core'

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
}

/**
 * Five depth bands. Lower bands reuse upper-band fixtures so transitions
 * feel continuous. Crystal-caverns + core lean on the lighting system.
 */
export const BIOMES: Biome[] = [
  {
    name: 'topsoil',
    minDepth: 0,
    maxDepth: 20,
    caveCount: [0, 0],
    fixtureCount: [0, 0],
    fixtureKinds: [],
    gemCount: [1, 2],
    gemPalette: ['emerald'],
    soilDensity: 0.95,
  },
  {
    name: 'deep-dirt',
    minDepth: 20,
    maxDepth: 50,
    caveCount: [1, 2],
    fixtureCount: [0, 1],
    fixtureKinds: ['bone'],
    gemCount: [3, 4],
    gemPalette: ['emerald', 'topaz', 'ruby'],
    soilDensity: 0.92,
  },
  {
    name: 'stoneworks',
    minDepth: 50,
    maxDepth: 100,
    caveCount: [2, 3],
    fixtureCount: [1, 3],
    fixtureKinds: ['stone-pillar', 'bone', 'mushroom'],
    gemCount: [4, 6],
    gemPalette: ['emerald', 'topaz', 'ruby', 'amethyst'],
    soilDensity: 0.78,
  },
  {
    name: 'crystal-caverns',
    minDepth: 100,
    maxDepth: 200,
    caveCount: [3, 4],
    fixtureCount: [2, 3],
    fixtureKinds: ['crystal', 'stone-pillar'],
    gemCount: [3, 5],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.5,
  },
  {
    name: 'core',
    minDepth: 200,
    maxDepth: 9999,
    caveCount: [4, 5],
    fixtureCount: [2, 3],
    fixtureKinds: ['crystal'],
    gemCount: [2, 3],
    gemPalette: ['amethyst', 'topaz'],
    soilDensity: 0.3,
  },
]

/** Lookup the biome for a depth in cells. */
export function biomeAt(depthM: number): Biome {
  for (const b of BIOMES) {
    if (depthM >= b.minDepth && depthM < b.maxDepth) return b
  }
  return BIOMES[BIOMES.length - 1]!
}
