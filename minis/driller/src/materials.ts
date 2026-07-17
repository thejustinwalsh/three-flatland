import { useMemo } from 'react'
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, TextureLoader } from 'three'
import { Sprite2DMaterial } from 'three-flatland/react'
import drillerAnimationsUrl from './assets/driller/driller-animations.png?inline'
import worldTilesUrl from './assets/driller/world-tiles.png?inline'
import gemPickupsUrl from './assets/driller/gem-pickups-atlas.png?inline'
import actionIconsUrl from './assets/driller/action-icons.png?inline'

/**
 * 1×1 fully-opaque white texture so sprites have something to sample.
 * Combined with a per-sprite tint, this supplies solid-color UI and effect
 * primitives without loading another bitmap asset.
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

/** Shared white-pixel material for tintable UI and effect primitives. */
export function useDrillerMaterial(): Sprite2DMaterial {
  return useMemo(() => new Sprite2DMaterial({ map: createWhiteTexture(), transparent: true }), [])
}

/** Concept-sheet character art, extracted by tools/extract-concept-art.mjs. */
export function useDrillerCharacterMaterial(): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(drillerAnimationsUrl)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    tex.generateMipmaps = false
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [])
}

/** One 16×16 atlas for biome terrain plus transparent fixture overlays. */
export function useWorldTileMaterial(): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(worldTilesUrl)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    tex.generateMipmaps = false
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [])
}

export function useGemMaterial(): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(gemPickupsUrl)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    tex.generateMipmaps = false
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [])
}

/** Pixel-fixed Help / Sabotage badges extracted from the concept sheet. */
export function useActionIconsMaterial(): Sprite2DMaterial {
  return useMemo(() => {
    const tex = new TextureLoader().load(actionIconsUrl)
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    tex.generateMipmaps = false
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
    // Default flipY=true (three.js standard). Sprite2D.setFrame expects
    // bottom-left-origin UV coords (three.js convention); callers must
    // flip their pixel-y when converting top-left asset rects → frame.
    // See e.g. MoodBubbleRenderer.frameOf for the y-flip.
    return new Sprite2DMaterial({ map: tex, transparent: true })
  }, [url])
}

export function useIconsMaterial(): Sprite2DMaterial {
  return useSheetMaterial(ICONS_SHEET_URL)
}

export function useDigitsMaterial(): Sprite2DMaterial {
  return useSheetMaterial(DIGITS_SHEET_URL)
}
