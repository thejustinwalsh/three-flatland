import { useMemo } from 'react'
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, TextureLoader } from 'three'
import { Sprite2DMaterial } from 'three-flatland/react'
import { ROCK_AUTOTILE_URL } from './textures'

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
  // Unified amber placeholder — fixtures all render the same colour
  // until per-variant sprites land with the art pass. See
  // TileRenderer's TINT_FIXTURE for the matching tint vector.
  fixture: '#e0bd66',
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

/**
 * Rock-autotile material. Uses the 320×20 SVG atlas (16 frames
 * indexed by 4-bit mask: low bits N/S/E/W of stone-neighbor presence).
 * Each stone sprite picks its frame via Sprite2D.setFrame() with
 * normalized UVs computed from the slot stride + 2px transparent
 * gutters baked into the asset. The atlas is white-on-transparent
 * with darker strokes only on edges where there's no neighbor, so
 * runtime tinting (TINT_STONE / TINT_DAMAGED_STONE / cracking
 * gradient) recolors the rock body while strokes stay legible.
 */
export function useRockAutotileMaterial(): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(ROCK_AUTOTILE_URL)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [])
}

/**
 * Hollow-square 16×16 texture for the hover-target outline. 1-pixel
 * white border, transparent interior. Tinted per-cell at runtime so
 * one material covers every action's color.
 */
function createOutlineTexture(): DataTexture {
  const size = 16
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const onBorder = x === 0 || x === size - 1 || y === 0 || y === size - 1
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = onBorder ? 255 : 0
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function useOutlineMaterial(): Sprite2DMaterial {
  return useMemo(() => new Sprite2DMaterial({ map: createOutlineTexture(), transparent: true }), [])
}

/**
 * Sprite-sheet material loader for the baked HUD glyph sheets. The
 * PNG is imported via Vite's `?inline` so the sheet is bundled as a
 * data URL — matches the project's existing texture loading pattern
 * (see `textures.ts`), required for the library-mode build.
 */
import { SHEET_URL as ICONS_SHEET_URL } from './generated/icons'
import { SHEET_URL as DIGITS_SHEET_URL } from './generated/digits'

function useSheetMaterial(url: string): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(url)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [url])
}

export function useIconsMaterial(): Sprite2DMaterial {
  return useSheetMaterial(ICONS_SHEET_URL)
}

export function useDigitsMaterial(): Sprite2DMaterial {
  return useSheetMaterial(DIGITS_SHEET_URL)
}
