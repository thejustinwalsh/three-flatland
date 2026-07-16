import type { BiomeName } from '../biomes'

export const MAX_GEM_LIGHTS = 64
export const MAX_CRYSTAL_LIGHTS = 24

export const GEM_LIGHT_COLOR = {
  emerald: 0x34d399,
  topaz: 0x38bdf8,
  ruby: 0xf43f5e,
  amethyst: 0xa78bfa,
} as const

export const BIOME_AMBIENT = {
  topsoil: { color: 0xffe8c5, intensity: 0.58 },
  'deep-dirt': { color: 0xd9a279, intensity: 0.68 },
  stoneworks: { color: 0xaebbd5, intensity: 0.6 },
  'crystal-caverns': { color: 0x9c8cff, intensity: 0.52 },
  core: { color: 0xc08cff, intensity: 0.48 },
} satisfies Record<BiomeName, { color: number; intensity: number }>

export interface LightCandidate {
  x: number
  y: number
}

interface VisibleBounds {
  left: number
  right: number
  top: number
  bottom: number
}

/** Cull to the padded camera rect, then keep the nearest lights to the driller. */
export function selectVisibleLights<T extends LightCandidate>(
  candidates: readonly T[],
  bounds: VisibleBounds,
  focus: LightCandidate,
  limit: number
): T[] {
  if (limit <= 0) return []
  return candidates
    .filter(
      (candidate) =>
        candidate.x >= bounds.left &&
        candidate.x <= bounds.right &&
        candidate.y >= bounds.top &&
        candidate.y <= bounds.bottom
    )
    .sort((a, b) => {
      const adx = a.x - focus.x
      const ady = a.y - focus.y
      const bdx = b.x - focus.x
      const bdy = b.y - focus.y
      return adx * adx + ady * ady - (bdx * bdx + bdy * bdy)
    })
    .slice(0, limit)
}

/** Surface daylight is camera-relative and gone four rows underground. */
export function surfaceSunIntensity(cameraTopRow: number): number {
  return Math.max(0, Math.min(1, 1 - cameraTopRow / 4))
}
