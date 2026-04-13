import { Loader } from 'three'
import { SkiaContext } from '../context'
import { Skia } from '../init'
import { SkiaTypeface } from '../font'

/**
 * Three.js Loader for Skia typefaces. Compatible with R3F's `useLoader`.
 *
 * Returns a `SkiaTypeface` — call `.atSize(n)` to get a sized `SkiaFont`.
 *
 * ```tsx
 * // R3F
 * const typeface = useLoader(SkiaFontLoader, '/fonts/Inter.ttf')
 * const titleFont = typeface.atSize(32)
 * const bodyFont = typeface.atSize(14)
 *
 * // Three.js
 * const typeface = await SkiaFontLoader.load('/fonts/Inter.ttf')
 * const font = typeface.atSize(16)
 * ```
 */
export class SkiaFontLoader extends Loader<SkiaTypeface> {
  /** SkiaContext to bind to the typeface — falls back to singleton */
  context: SkiaContext | null = null

  /** Static default context */
  static context: SkiaContext | null = null

  private static cache = new Map<string, Promise<SkiaTypeface>>()

  loadAsync(url: string): Promise<SkiaTypeface> {
    return SkiaFontLoader.load(url, this.context ?? undefined)
  }

  /** Load a typeface (cached by URL). Context resolved lazily if not provided. */
  static load(url: string, context?: SkiaContext): Promise<SkiaTypeface> {
    const cached = this.cache.get(url)
    if (cached) return cached

    const promise = this._loadUncached(url, context)
    this.cache.set(url, promise)
    return promise
  }

  private static async _loadUncached(url: string, context?: SkiaContext): Promise<SkiaTypeface> {
    // Fetch bytes (no context needed)
    const response = await fetch(url)
    const data = new Uint8Array(await response.arrayBuffer())

    // Resolve context — explicit > static default > singleton > pending init
    let ctx: SkiaContext | null = context ?? this.context ?? SkiaContext.instance
    if (!ctx && Skia.pending) {
      ctx = await Skia.pending
    }

    // Context can be null — SkiaTypeface defers handle creation to atSize()
    return new SkiaTypeface(ctx, data)
  }

  static preload(urls: string[]): Promise<SkiaTypeface[]> {
    return Promise.all(urls.map((url) => this.load(url)))
  }

  static clearCache(): void {
    this.cache.clear()
  }
}
