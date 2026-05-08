import { useMemo } from 'react'
import { Sprite2DMaterial } from 'three-flatland/react'

/**
 * Tile-class palette — used for placeholder solid-color sprites until the
 * tileset PNG is sliced (follow-up sub-issue). Hex strings match spec §11.1.
 */
export const TILE_COLORS = {
  soilTop: '#5fa847',
  soilEdge: '#6b4a2b',
  soilDeep: '#5d3f24',
  stone: '#71717a',
  fixtureBone: '#e7e5d4',
  fixtureMushroom: '#a78bfa',
  fixtureCrystal: '#7c3aed',
  gemEmerald: '#34d399',
  gemTopaz: '#fcd34d',
  gemRuby: '#f43f5e',
  gemAmethyst: '#a78bfa',
  driller: '#fcd34d',
  ghost: '#bfdbfe',
} as const

/**
 * Single shared transparent material — sprites tint to their target color
 * via Sprite2D's `tintColor`. Once the atlas regions are dialed in, this
 * material gets a real texture and sprites pick UV ranges per cell.
 */
export function useDrillerMaterial(): Sprite2DMaterial {
  return useMemo(() => new Sprite2DMaterial({ transparent: true }), [])
}
