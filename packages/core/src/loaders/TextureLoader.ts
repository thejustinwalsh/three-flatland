import { Loader, type Texture, TextureLoader as ThreeTextureLoader } from 'three'
import {
  type TexturePreset,
  type TextureOptions,
  applyTextureOptions,
  resolveTextureOptions,
} from './texturePresets'

/**
 * Options for loading a texture.
 */
export interface TextureLoaderOptions {
  /** Texture preset or custom options. Overrides loader and global defaults. */
  texture?: TexturePreset | TextureOptions
}

/**
 * Texture loader with hierarchical preset support.
 *
 * Extends Three.js's Loader class for compatibility with R3F's useLoader.
 * Automatically applies texture presets based on the hierarchy:
 * 1. TextureLoader.options (static loader default)
 * 2. TextureConfig.options (global default)
 * 3. 'pixel-art' (system default)
 *
 * @example
 * ```typescript
 * // Vanilla usage - static API
 * const texture = await TextureLoader.load('/sprites/player.png')
 *
 * // R3F usage - works with useLoader
 * import { TextureLoader } from '@three-flatland/react'
 * const texture = useLoader(TextureLoader, '/sprite.png')
 * // Presets are automatically applied!
 *
 * // Override presets for specific textures
 * const smoothTexture = await TextureLoader.load('/ui.png', { texture: 'smooth' })
 *
 * // Set loader-level default
 * TextureLoader.options = 'smooth'
 * ```
 */
export class TextureLoader extends Loader<Texture> {
  private static internalLoader = new ThreeTextureLoader()
  private static cache = new Map<string, Promise<Texture>>()

  /**
   * Texture options for this loader class.
   * When undefined, falls through to TextureConfig.options.
   */
  static options: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Instance-level preset override.
   * Set via R3F's useLoader extension callback.
   *
   * @example
   * ```tsx
   * // Override preset for specific textures via extension
   * const texture = useLoader(TextureLoader, '/ui.png', (loader) => {
   *   loader.preset = 'smooth'
   * })
   * ```
   */
  preset: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Load a texture (callback style for R3F useLoader compatibility).
   * Presets are automatically applied.
   */
  load(
    url: string,
    onLoad?: (texture: Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): Texture {
    // Instance preset > static options > global config > 'pixel-art'
    const resolved = resolveTextureOptions(this.preset, TextureLoader.options)

    return TextureLoader.internalLoader.load(
      url,
      (texture) => {
        applyTextureOptions(texture, resolved)
        onLoad?.(texture)
      },
      onProgress,
      onError
    )
  }

  /**
   * Load a texture asynchronously.
   * Presets are automatically applied.
   */
  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject)
    })
  }

  // ==========================================
  // Static API for vanilla usage
  // ==========================================

  /**
   * Load a texture from a URL (static method for vanilla usage).
   * Results are cached by URL and resolved options.
   */
  static load(url: string, options?: TextureLoaderOptions): Promise<Texture> {
    const cacheKey = this.getCacheKey(url, options)

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const promise = this.loadUncached(url, options)
    this.cache.set(cacheKey, promise)
    return promise
  }

  /**
   * Get cache key including resolved options.
   */
  private static getCacheKey(url: string, options?: TextureLoaderOptions): string {
    const resolved = resolveTextureOptions(options?.texture, this.options)
    const optionsKey = typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
    return `${url}:${optionsKey}`
  }

  /**
   * Load without caching.
   */
  private static loadUncached(url: string, options?: TextureLoaderOptions): Promise<Texture> {
    const resolved = resolveTextureOptions(options?.texture, this.options)

    return new Promise((resolve, reject) => {
      this.internalLoader.load(
        url,
        (texture) => {
          applyTextureOptions(texture, resolved)
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }

  /**
   * Preload multiple textures.
   */
  static preload(urls: string[], options?: TextureLoaderOptions): Promise<Texture[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear()
  }
}

/**
 * Apply hierarchical texture presets to a texture.
 *
 * Useful when you need to override presets after loading, or when
 * using Three's TextureLoader directly.
 *
 * Hierarchy (highest to lowest priority):
 * 1. instanceOptions (per-call override)
 * 2. loaderOptions (loader-level default)
 * 3. TextureConfig.options (global default)
 * 4. 'pixel-art' (system default)
 *
 * @example
 * ```typescript
 * // Override presets on an already-loaded texture
 * const texture = await TextureLoader.load('/sprite.png')
 * applyHierarchicalPresets(texture, 'smooth') // Override to smooth filtering
 * ```
 */
export function applyHierarchicalPresets(
  texture: Texture,
  instanceOptions?: TexturePreset | TextureOptions,
  loaderOptions?: TexturePreset | TextureOptions
): void {
  const resolved = resolveTextureOptions(instanceOptions, loaderOptions)
  applyTextureOptions(texture, resolved)
}
