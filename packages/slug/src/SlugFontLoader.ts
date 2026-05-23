import {
  DataTexture,
  FloatType,
  HalfFloatType,
  Loader,
  NearestFilter,
  RGBAFormat,
  RGFormat,
} from 'three'
import type { BakedAssetLoaderOptions } from '@three-flatland/bake'
import { readGlb } from './glb'
import { SlugFont } from './SlugFont'
import { bakedURLs, unpackBaked } from './baked'
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
  /**
   * Generate this font's glyph data in the browser on every load
   * instead of loading a pre-baked sidecar (`opentype.js` runs in-process).
   * The font is always shaped either way; this flag chooses *where* the
   * shaping happens. See {@link BakedAssetLoaderOptions.forceRuntime}.
   */
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
  static load(url: string, options?: BakedAssetLoaderOptions): Promise<SlugFont> {
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

  private static async _tryLoadBaked(fontURL: string): Promise<SlugFont | null> {
    const glbURL = bakedURLs(fontURL)

    let response: Response
    try {
      response = await fetch(glbURL)
    } catch {
      return null
    }
    if (!response.ok) return null

    try {
      const buf = await response.arrayBuffer()
      const asset = readGlb(buf)
      const ext = asset.ext<Record<string, unknown>>('FL_slug_font')
      if (!ext) return null

      const bakedData = unpackBaked(asset)
      const columns = ext['columns'] as Record<string, { accessor: number }>
      const metrics = ext['metrics'] as {
        unitsPerEm: number
        ascender: number
        descender: number
        capHeight: number
        underlinePosition: number
        underlineThickness: number
        strikethroughPosition: number
        strikethroughThickness: number
        subscriptScale: { x: number; y: number }
        subscriptOffset: { x: number; y: number }
        superscriptScale: { x: number; y: number }
        superscriptOffset: { x: number; y: number }
      }
      const curveTexMeta = ext['curveTexture'] as { width: number; height: number; format: string }
      const bandTexMeta = ext['bandTexture'] as { width: number; height: number; format: string }

      // ── Curve texture: RGBA16F → HalfFloatType ──
      // The accessor is USHORT SCALAR holding the raw half-float bits.
      const curveData = asset.accessor(columns['curveTexture']!.accessor) as Uint16Array
      const curveTexture = new DataTexture(
        curveData,
        curveTexMeta.width,
        curveTexMeta.height,
        RGBAFormat,
        HalfFloatType
      )
      curveTexture.magFilter = NearestFilter
      curveTexture.minFilter = NearestFilter
      curveTexture.needsUpdate = true

      // ── Band texture: RG32F → FloatType ──
      const bandData = asset.accessor(columns['bandTexture']!.accessor) as Float32Array
      const bandTexture = new DataTexture(
        bandData,
        bandTexMeta.width,
        bandTexMeta.height,
        RGFormat,
        FloatType
      )
      bandTexture.magFilter = NearestFilter
      bandTexture.minFilter = NearestFilter
      bandTexture.needsUpdate = true

      const font = SlugFont._createBaked(
        bakedData.glyphs,
        { curveTexture, bandTexture, textureWidth: curveTexMeta.width },
        {
          unitsPerEm: metrics.unitsPerEm,
          ascender: metrics.ascender,
          descender: metrics.descender,
          capHeight: metrics.capHeight,
          underlinePosition: metrics.underlinePosition,
          underlineThickness: metrics.underlineThickness,
          strikethroughPosition: metrics.strikethroughPosition,
          strikethroughThickness: metrics.strikethroughThickness,
          subscriptScale: metrics.subscriptScale,
          subscriptOffset: metrics.subscriptOffset,
          superscriptScale: metrics.superscriptScale,
          superscriptOffset: metrics.superscriptOffset,
        },
        bakedData,
        shapeTextBaked,
        wrapLinesBaked,
        measureTextBaked
      )

      if (ext['strokeSets']) {
        font.strokeSets = ext['strokeSets'] as typeof font.strokeSets
      }

      return font
    } catch (err) {
      // A present-but-corrupt/incompatible .slug.glb degrades to the runtime
      // path rather than failing the whole load.
      console.warn('[slug] baked .slug.glb failed to parse; falling back to runtime', err)
      return null
    }
  }

  private static async _loadRuntime(url: string): Promise<SlugFont> {
    // Runtime build path: builds the SlugFont directly from the fetched font
    // file via already-lazy pipeline imports. It does NOT bake a `.slug.glb`,
    // so `@gltf-transform/core` (reachable only through `./bake`) stays out of
    // the browser static graph. If runtime GLB baking is ever added here, it
    // MUST `await import('./bake.js')` to pull `packBaked` lazily — gated by
    // `forceRuntime`, per the `@three-flatland/normals` `resolveNormalMap`
    // precedent — so the heavy dep never enters the `.` entry's static graph.
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
