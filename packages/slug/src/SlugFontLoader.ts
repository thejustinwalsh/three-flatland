import { DataTexture, FloatType, HalfFloatType, Loader, NearestFilter, RGBAFormat, RGFormat } from 'three'
import { SlugFont } from './SlugFont.js'
import { BAKED_VERSION, bakedURLs, unpackBaked } from './baked.js'
import { shapeTextBaked } from './pipeline/textShaperBaked.js'
import { wrapLinesBaked } from './pipeline/wrapLinesBaked.js'
import { measureTextBaked } from './pipeline/textMeasureBaked.js'
import type { BakedJSON } from './baked.js'

/**
 * The single entry point for loading SlugFont data.
 *
 * Automatically tries pre-baked data first ({name}.slug.json + .slug.bin).
 * When baked data is present, opentype.js is never loaded and the original
 * font file is never fetched. Falls back to full runtime parsing otherwise.
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
    onError?: (err: unknown) => void,
  ): SlugFont {
    const resolvedURL = this.manager.resolveURL(url)
    const placeholder = {} as SlugFont

    SlugFontLoader._loadImpl(resolvedURL, this.forceRuntime)
      .then((font) => { onLoad?.(font) })
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

  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<SlugFont> {
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
      console.warn(`[slug] Generating font data at runtime. Bake with \`npx slug-bake\` for production.`)
    }
    return this._loadRuntime(url)
  }

  private static async _tryLoadBaked(fontURL: string): Promise<SlugFont | null> {
    const urls = bakedURLs(fontURL)

    try {
      const [jsonResp, binResp] = await Promise.all([
        fetch(urls.json),
        fetch(urls.bin),
      ])

      if (!jsonResp.ok || !binResp.ok) return null

      const meta: BakedJSON = await jsonResp.json()
      if (meta.version !== BAKED_VERSION) return null

      const binBuffer = await binResp.arrayBuffer()

      // Curve texture: RGBA16F — 2 bytes per channel × 4 channels = 8 bytes/texel
      const curveTexture = new DataTexture(
        new Uint16Array(binBuffer, meta.curveTexture.byteOffset, meta.curveTexture.byteLength / 2),
        meta.textureWidth, meta.curveTexture.height, RGBAFormat, HalfFloatType,
      )
      curveTexture.minFilter = NearestFilter
      curveTexture.magFilter = NearestFilter
      curveTexture.needsUpdate = true

      // Band texture: RG32F — 4 bytes per channel × 2 channels = 8 bytes/texel
      const bandTexture = new DataTexture(
        new Float32Array(binBuffer, meta.bandTexture.byteOffset, meta.bandTexture.byteLength / 4),
        meta.textureWidth, meta.bandTexture.height, RGFormat, FloatType,
      )
      bandTexture.minFilter = NearestFilter
      bandTexture.magFilter = NearestFilter
      bandTexture.needsUpdate = true

      const bakedData = unpackBaked(binBuffer, meta)

      return SlugFont._createBaked(
        bakedData.glyphs,
        { curveTexture, bandTexture, textureWidth: meta.textureWidth },
        meta.metrics,
        bakedData,
        shapeTextBaked,
        wrapLinesBaked,
        measureTextBaked,
      )
    } catch {
      return null
    }
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
      import('./pipeline/fontParser.js'),
      import('./pipeline/texturePacker.js'),
      import('./pipeline/textShaper.js'),
      import('./pipeline/wrapLines.js'),
      import('./pipeline/textMeasure.js'),
    ])

    const buffer = await response.arrayBuffer()
    const { glyphs, unitsPerEm, ascender, descender, capHeight } = parseFont(buffer)
    const textures = packTextures(glyphs)
    const otFont = opentype.parse(buffer)

    return SlugFont._createRuntime(
      glyphs,
      textures,
      { unitsPerEm, ascender, descender, capHeight },
      otFont,
      shapeText,
      wrapLines,
      measureText,
    )
  }
}
