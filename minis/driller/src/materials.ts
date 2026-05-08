import { useMemo } from 'react'
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three'
import { Sprite2DMaterial } from 'three-flatland/react'

/**
 * Tile-class palette — used for placeholder solid-color sprites until the
 * tileset PNG is sliced (follow-up sub-issue #60). Hex strings match
 * spec §11.1.
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
 * 1×1 fully-opaque white texture so sprites have something to sample.
 * Combined with the per-sprite `tint` color this renders as a flat solid.
 * When sub-issue #60 lands, this is replaced by the sliced atlas texture.
 */
function createWhiteTexture(): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255])
  const tex = new DataTexture(data, 1, 1, RGBAFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Single shared material — sprites tint to their target color via the
 * Sprite2D `tint` prop. Once the atlas regions are dialed in this gets a
 * real tileset texture and sprites pick UV ranges per cell.
 */
export function useDrillerMaterial(): Sprite2DMaterial {
  return useMemo(() => new Sprite2DMaterial({ map: createWhiteTexture(), transparent: true }), [])
}
