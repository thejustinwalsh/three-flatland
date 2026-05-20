import {
  DataTexture,
  FloatType,
  HalfFloatType,
  Loader,
  NearestFilter,
  RGBAFormat,
  RGFormat,
} from 'three'
import { SlugFont } from './SlugFont'
// TODO(G4.2): bakedURLs now returns a single .slug.glb URL; _tryLoadBaked is
// stubbed until G4.2 implements the GLB read path via readAsset.
import { bakedURLs as _bakedURLs } from './baked'
import { shapeTextBaked } from './pipeline/textShaperBaked'
import { wrapLinesBaked } from './pipeline/wrapLinesBaked'
import { measureTextBaked } from './pipeline/textMeasureBaked'

/**
 * The single entry point for loading SlugFont data.
 *
 * Tries pre-baked data first (a single {name}.slug.glb). When baked data is
 * present, opentype.js is never loaded and the original font file is never
 * fetched. Falls back to full runtime parsing otherwise. The baked .slug.glb
 * fast-path is wired in G4.2; until then this falls through to runtime.
 *
 * @example
 * ```typescript
 * // Vanilla — static API
 * const font = await SlugFontLoader.load('/fonts/Inter-Regular.ttf')
 *
 * // Vanilla — force runtime parsing (skip baked data)
 * const font = await SlugFontLoader.load('/fonts/Inter-Regular.ttf', { forceRuntime: true })
 *
 * // R3F — useLoader (inside Canvas, with Suspense)
 * import { useLoader } from '@react-three/fiber/webgpu'
 * import { SlugFontLoader } from '@three-flatland/slug/react'
 * const font = useLoader(SlugFontLoader, '/fonts/Inter-Regular.ttf')
 *
 * // R3F — force runtime via extension callback
 * const font = useLoader(SlugFontLoader, '/fonts/Inter-Regular.ttf', (loader) => {
 *   loader.forceRuntime = true
 * })
 * ```
 *
 * Pre-bake fonts with: `npx slug-bake fonts/Inter-Regular.ttf`
 */
export class SlugFontLoader extends Loader<SlugFont> {
  /** Skip baked data and always parse the font file at runtime. */
  forceRuntime = false

  // ─── Instance API (R3F useLoader compatibility) ───

  /**
   * Load a font (callback style for R3F useLoader compatibility).
   * Tries baked data first, falls back to runtime parsing.
   */
  load(
    url: string,
    onLoad?: (font: SlugFont) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): SlugFont {
    const resolvedURL = this.manager.resolveURL(url)
    const placeholder = {} as SlugFont

    SlugFontLoader._loadImpl(resolvedURL, this.forceRuntime)
      .then((font) => {
        onLoad?.(font)
      })
      .catch((err) => {
        if (onError) {
          onError(err)
        } else {
          console.error('SlugFontLoader:', err)
        }
        this.manager.itemError(url)
      })

    return placeholder
  }

  loadAsync(url: string, _onProgress?: (event: ProgressEvent) => void): Promise<SlugFont> {
    return SlugFontLoader._loadImpl(this.manager.resolveURL(url), this.forceRuntime)
  }

  // ─── Static API (vanilla usage) ───

  private static _cache = new Map<string, Promise<SlugFont>>()

  /**
   * Load a font from a URL (static method for vanilla usage).
   * Results are cached by URL. Tries baked data first.
   */
  static load(url: string, options?: { forceRuntime?: boolean }): Promise<SlugFont> {
    const forceRuntime = options?.forceRuntime ?? false
    const cacheKey = forceRuntime ? `${url}:runtime` : url
    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const promise = this._loadImpl(url, forceRuntime)
    this._cache.set(cacheKey, promise)
    return promise
  }

  /** Clear the static cache. */
  static clearCache(): void {
    this._cache.clear()
  }

  // ─── Implementation ───

  private static async _loadImpl(url: string, forceRuntime: boolean): Promise<SlugFont> {
    if (!forceRuntime) {
      const baked = await this._tryLoadBaked(url)
      if (baked) return baked
    }

    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'production') {
      console.warn(
        `[slug] Generating font data at runtime. Bake with \`npx slug-bake\` for production.`
      )
    }
    return this._loadRuntime(url)
  }

  // TODO(G4.2): Rewrite to fetch a single .slug.glb via readAsset and reconstruct
  // the font from FL_slug_font accessor refs. The bakedURLs() function now returns
  // a single .slug.glb URL; the old json+bin two-fetch path is superseded.
  private static async _tryLoadBaked(_fontURL: string): Promise<SlugFont | null> {
    // G4.2 implements the GLB read path. Until then, always fall through to runtime.
    return null
  }

  private static async _loadRuntime(url: string): Promise<SlugFont> {
    const [
      response,
      opentype,
      { parseFont },
      { packTextures },
      { shapeText },
      { wrapLines },
      { measureText },
    ] = await Promise.all([
      fetch(url),
      import('opentype.js'),
      import('./pipeline/fontParser'),
      import('./pipeline/texturePacker'),
      import('./pipeline/textShaper'),
      import('./pipeline/wrapLines'),
      import('./pipeline/textMeasure'),
    ])

    const buffer = await response.arrayBuffer()
    const parsed = parseFont(buffer)
    const { glyphs } = parsed
    const textures = packTextures(glyphs)
    const otFont = opentype.parse(buffer)

    return SlugFont._createRuntime(
      glyphs,
      textures,
      {
        unitsPerEm: parsed.unitsPerEm,
        ascender: parsed.ascender,
        descender: parsed.descender,
        capHeight: parsed.capHeight,
        underlinePosition: parsed.underlinePosition,
        underlineThickness: parsed.underlineThickness,
        strikethroughPosition: parsed.strikethroughPosition,
        strikethroughThickness: parsed.strikethroughThickness,
        subscriptScale: parsed.subscriptScale,
        subscriptOffset: parsed.subscriptOffset,
        superscriptScale: parsed.superscriptScale,
        superscriptOffset: parsed.superscriptOffset,
      },
      otFont,
      shapeText,
      wrapLines,
      measureText
    )
  }
}
