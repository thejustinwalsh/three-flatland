import { Loader } from 'three'
import { SkiaContext } from '../context'
import { SkiaFont } from '../font'

export interface SkiaFontLoaderOptions {
  /** Font size in points */
  size?: number
  /** SkiaContext to use — required. Set via loader.context or SkiaFontLoader.context */
  context?: SkiaContext
}

/**
 * Three.js Loader for Skia fonts. Compatible with R3F's `useLoader`.
 *
 * ```tsx
 * // R3F
 * const font = useLoader(SkiaFontLoader, '/fonts/Inter.ttf', (loader) => {
 *   loader.context = skiaContext
 *   loader.size = 16
 * })
 *
 * // Vanilla
 * const font = await SkiaFontLoader.load('/fonts/Inter.ttf', { context: skia, size: 16 })
 * ```
 */
export class SkiaFontLoader extends Loader<SkiaFont> {
  /** Shared SkiaContext — set before loading */
  context: SkiaContext | null = null
  /** Default font size */
  size = 16

  /** Static defaults */
  static context: SkiaContext | null = null
  static defaultSize = 16

  private static cache = new Map<string, Promise<SkiaFont>>()

  loadAsync(url: string): Promise<SkiaFont> {
    const size = this.size ?? SkiaFontLoader.defaultSize
    return SkiaFontLoader.load(url, { context: this.context ?? undefined, size })
  }

  static load(url: string, options?: SkiaFontLoaderOptions): Promise<SkiaFont> {
    const size = options?.size ?? this.defaultSize
    const key = `${url}:${size}`
    const cached = this.cache.get(key)
    if (cached) return cached

    const promise = this._loadUncached(url, options)
    this.cache.set(key, promise)
    return promise
  }

  private static async _loadUncached(url: string, options?: SkiaFontLoaderOptions): Promise<SkiaFont> {
    let ctx = options?.context ?? this.context ?? SkiaContext.instance
    if (!ctx) {
      // Await in-flight Skia.init() — allows useLoader to work without explicit context
      const { Skia } = await import('../init')
      if (Skia.pending) ctx = await Skia.pending
    }
    if (!ctx) throw new Error('SkiaFontLoader: no SkiaContext available. Call Skia.init(renderer) first.')
    const size = options?.size ?? this.defaultSize

    const response = await fetch(url)
    const data = new Uint8Array(await response.arrayBuffer())
    return new SkiaFont(ctx, data, size)
  }

  static preload(urls: string[], options?: SkiaFontLoaderOptions): Promise<SkiaFont[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }

  static clearCache(): void {
    this.cache.clear()
  }
}
