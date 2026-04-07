import { Loader } from 'three'
import { SkiaContext } from '../context'
import { SkiaImage } from '../image'

export interface SkiaImageLoaderOptions {
  context?: SkiaContext
}

/**
 * Three.js Loader for Skia images. Uses the browser's native image decoder.
 * Compatible with R3F's `useLoader`.
 *
 * ```tsx
 * const image = useLoader(SkiaImageLoader, '/textures/cat.png', (loader) => {
 *   loader.context = skiaContext
 * })
 * ```
 */
export class SkiaImageLoader extends Loader<SkiaImage> {
  context: SkiaContext | null = null
  static context: SkiaContext | null = null

  private static cache = new Map<string, Promise<SkiaImage>>()

  loadAsync(url: string): Promise<SkiaImage> {
    return SkiaImageLoader.load(url, { context: this.context ?? undefined })
  }

  static load(url: string, options?: SkiaImageLoaderOptions): Promise<SkiaImage> {
    const cached = this.cache.get(url)
    if (cached) return cached

    const promise = this._loadUncached(url, options)
    this.cache.set(url, promise)
    return promise
  }

  private static async _loadUncached(url: string, options?: SkiaImageLoaderOptions): Promise<SkiaImage> {
    let ctx = options?.context ?? this.context ?? SkiaContext.instance
    if (!ctx) {
      // Await in-flight Skia.init() — allows useLoader to work without explicit context
      const { Skia } = await import('../init')
      if (Skia.pending) ctx = await Skia.pending
    }
    if (!ctx) throw new Error('SkiaImageLoader: no SkiaContext available. Call Skia.init(renderer) first.')

    const image = await SkiaImage.fromURL(ctx, url)
    if (!image) throw new Error(`SkiaImageLoader: failed to load ${url}`)
    return image
  }

  static preload(urls: string[], options?: SkiaImageLoaderOptions): Promise<SkiaImage[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }

  static clearCache(): void {
    this.cache.clear()
  }
}
