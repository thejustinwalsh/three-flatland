import { Loader } from 'three'
import { SlugShapeSet } from './SlugShapeSet.js'

/**
 * Loads a baked `FL_slug_shapes` `.glb` (written by `packShapeSet`, see
 * `@three-flatland/slug/bake`) into a `SlugShapeSet` — the shape-set
 * analogue of `SlugFontLoader`.
 *
 * Unlike `SlugFontLoader`, there is **no runtime-parse fallback**: an icon
 * atlas has no single "source file" to fall back to (it may bundle dozens
 * of SVGs), so a missing or corrupt `.glb` is a hard, descriptive error
 * here. The runtime SVG backend (`slug/svg`'s `loadSVGShapes`) is a
 * separate entry point; dispatching between the two per-icon is the
 * *consumer's* job (e.g. `@three-flatland/uikit`'s `Svg`), not this
 * loader's.
 *
 * @example
 * ```typescript
 * // Vanilla — static API
 * const atlas = await SlugShapeSetLoader.load('/icons.shapes.glb')
 *
 * // R3F — useLoader (inside Canvas, with Suspense)
 * import { useLoader } from '@react-three/fiber/webgpu'
 * import { SlugShapeSetLoader } from '@three-flatland/slug/react'
 * const atlas = useLoader(SlugShapeSetLoader, '/icons.shapes.glb')
 * ```
 */
export class SlugShapeSetLoader extends Loader<SlugShapeSet> {
  // ─── Instance API (R3F useLoader compatibility) ───

  /** Load a shape atlas (callback style for R3F useLoader compatibility). */
  load(
    url: string,
    onLoad?: (set: SlugShapeSet) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): SlugShapeSet {
    const resolvedURL = this.manager.resolveURL(url)
    const placeholder = {} as SlugShapeSet

    SlugShapeSetLoader._loadImpl(resolvedURL)
      .then((set) => {
        onLoad?.(set)
      })
      .catch((err) => {
        if (onError) {
          onError(err)
        } else {
          console.error('SlugShapeSetLoader:', err)
        }
        this.manager.itemError(url)
      })

    return placeholder
  }

  loadAsync(url: string, _onProgress?: (event: ProgressEvent) => void): Promise<SlugShapeSet> {
    return SlugShapeSetLoader._loadImpl(this.manager.resolveURL(url))
  }

  // ─── Static API (vanilla usage) ───

  private static _cache = new Map<string, Promise<SlugShapeSet>>()

  /** Load a baked shape atlas from a URL (static method for vanilla usage). Cached by URL. */
  static load(url: string): Promise<SlugShapeSet> {
    const cached = this._cache.get(url)
    if (cached) return cached

    const promise = this._loadImpl(url)
    this._cache.set(url, promise)
    return promise
  }

  /** Clear the static cache. */
  static clearCache(): void {
    this._cache.clear()
  }

  // ─── Implementation ───

  private static async _loadImpl(url: string): Promise<SlugShapeSet> {
    const response = await fetch(url)
    // `fetch` only rejects on a network failure, so a 404 arrives here as a
    // resolved response — surface the status explicitly instead of letting
    // `fromBaked` fail obscurely on an empty/HTML body.
    if (!response.ok) {
      throw new Error(
        `[slug] Failed to fetch shape atlas "${url}": HTTP ${response.status} ${response.statusText}`
      )
    }
    const buffer = await response.arrayBuffer()
    return SlugShapeSet.fromBaked(buffer)
  }
}
