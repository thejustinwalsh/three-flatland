import { Loader } from 'three'
import { SkiaContext } from '../context'
import { SkiaSVG } from '../svg'

export interface SkiaSVGLoaderOptions {
  context?: SkiaContext
}

/**
 * Three.js Loader for Skia SVG documents. Compatible with R3F's `useLoader`.
 *
 * ```tsx
 * const svg = useLoader(SkiaSVGLoader, '/icons/check.svg', (loader) => {
 *   loader.context = skiaContext
 * })
 * ```
 */
export class SkiaSVGLoader extends Loader<SkiaSVG> {
  context: SkiaContext | null = null
  static context: SkiaContext | null = null

  private static cache = new Map<string, Promise<SkiaSVG>>()

  loadAsync(url: string): Promise<SkiaSVG> {
    return SkiaSVGLoader.load(url, { context: this.context ?? undefined })
  }

  static load(url: string, options?: SkiaSVGLoaderOptions): Promise<SkiaSVG> {
    const cached = this.cache.get(url)
    if (cached) return cached

    const promise = this._loadUncached(url, options)
    this.cache.set(url, promise)
    return promise
  }

  private static async _loadUncached(url: string, options?: SkiaSVGLoaderOptions): Promise<SkiaSVG> {
    const ctx = options?.context ?? this.context ?? SkiaContext.instance
    if (!ctx) throw new Error('SkiaSVGLoader: no SkiaContext available. Call SkiaContext.create(gl) first.')

    const response = await fetch(url)
    const text = await response.text()
    return new SkiaSVG(ctx, text)
  }

  static preload(urls: string[], options?: SkiaSVGLoaderOptions): Promise<SkiaSVG[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }

  static clearCache(): void {
    this.cache.clear()
  }
}
