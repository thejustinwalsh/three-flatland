import { Loader } from 'three'
import type { Texture } from 'three'
import type { SpriteSheet, SpriteFrame, SpriteSheetJSONHash, SpriteSheetJSONArray } from '../sprites/types'
import { type TexturePreset, type TextureOptions, resolveTextureOptions } from './texturePresets'
import { TextureLoader } from './TextureLoader'

/**
 * Options for loading a spritesheet.
 */
export interface SpriteSheetLoaderOptions {
  /** Texture preset or custom options. Overrides loader and global defaults. */
  texture?: TexturePreset | TextureOptions
}

/**
 * Loader for spritesheet JSON files.
 *
 * Extends Three.js's Loader class for compatibility with R3F's useLoader.
 * Supports:
 * - JSON Hash format (TexturePacker default)
 * - JSON Array format
 *
 * @example
 * ```typescript
 * // Vanilla usage - static API
 * const sheet = await SpriteSheetLoader.load('/sprites/player.json');
 *
 * // R3F usage - works with useLoader
 * import { SpriteSheetLoader } from '@three-flatland/react';
 * const sheet = useLoader(SpriteSheetLoader, '/sprites/player.json');
 *
 * // Override preset via extension
 * const sheet = useLoader(SpriteSheetLoader, '/sprites/ui.json', (loader) => {
 *   loader.preset = 'smooth';
 * });
 *
 * // Set loader-level default
 * SpriteSheetLoader.options = 'smooth';
 * ```
 */
export class SpriteSheetLoader extends Loader<SpriteSheet> {
  private static cache = new Map<string, Promise<SpriteSheet>>()

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
   * const sheet = useLoader(SpriteSheetLoader, '/sprites/ui.json', (loader) => {
   *   loader.preset = 'smooth';
   * });
   * ```
   */
  preset: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Load a spritesheet asynchronously (for R3F useLoader compatibility).
   * Presets are automatically applied.
   */
  loadAsync(url: string): Promise<SpriteSheet> {
    const resolved = resolveTextureOptions(this.preset, SpriteSheetLoader.options)
    return SpriteSheetLoader.loadUncached(url, { texture: resolved })
  }

  // ==========================================
  // Static API for vanilla usage
  // ==========================================

  /**
   * Load a spritesheet from a JSON file (static method for vanilla usage).
   * Results are cached by URL and resolved options.
   */
  static load(url: string, options?: SpriteSheetLoaderOptions): Promise<SpriteSheet> {
    const cacheKey = this.getCacheKey(url, options)

    // Return cached promise if exists
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
  private static getCacheKey(url: string, options?: SpriteSheetLoaderOptions): string {
    const resolved = resolveTextureOptions(options?.texture, this.options)
    const optionsKey = typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
    return `${url}:${optionsKey}`
  }

  /**
   * Load without caching.
   */
  private static async loadUncached(
    url: string,
    options?: SpriteSheetLoaderOptions
  ): Promise<SpriteSheet> {
    // Fetch JSON
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load spritesheet: ${url}`)
    }
    const json = (await response.json()) as SpriteSheetJSONHash | SpriteSheetJSONArray

    // Determine format and parse
    const isArrayFormat = Array.isArray(json.frames)
    const parsed = isArrayFormat
      ? this.parseJSONArray(json as SpriteSheetJSONArray)
      : this.parseJSONHash(json as SpriteSheetJSONHash)

    // Resolve texture URL relative to JSON file
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
    const textureUrl = baseUrl + parsed.imagePath

    // Load texture with resolved options
    const resolved = resolveTextureOptions(options?.texture, this.options)
    const texture = await this.loadTexture(textureUrl, resolved)

    // Create SpriteSheet
    return this.createSpriteSheet(texture, parsed.frames, parsed.width, parsed.height)
  }

  /**
   * Parse JSON Hash format.
   */
  private static parseJSONHash(json: SpriteSheetJSONHash) {
    const frames = new Map<string, SpriteFrame>()
    const { w: atlasWidth, h: atlasHeight } = json.meta.size

    for (const [name, data] of Object.entries(json.frames)) {
      // Convert to normalized UV coordinates
      // Note: UV Y is flipped (0 = bottom, 1 = top) vs image coords (0 = top)
      const normalizedHeight = data.frame.h / atlasHeight
      const frame: SpriteFrame = {
        name,
        x: data.frame.x / atlasWidth,
        y: 1 - (data.frame.y / atlasHeight) - normalizedHeight,
        width: data.frame.w / atlasWidth,
        height: normalizedHeight,
        sourceWidth: data.sourceSize.w,
        sourceHeight: data.sourceSize.h,
        rotated: data.rotated,
        trimmed: data.trimmed,
        pivot: data.pivot,
      }

      if (data.trimmed) {
        frame.trimOffset = {
          x: data.spriteSourceSize.x,
          y: data.spriteSourceSize.y,
          width: data.spriteSourceSize.w,
          height: data.spriteSourceSize.h,
        }
      }

      frames.set(name, frame)
    }

    return {
      frames,
      imagePath: json.meta.image,
      width: atlasWidth,
      height: atlasHeight,
    }
  }

  /**
   * Parse JSON Array format.
   */
  private static parseJSONArray(json: SpriteSheetJSONArray) {
    const frames = new Map<string, SpriteFrame>()
    const { w: atlasWidth, h: atlasHeight } = json.meta.size

    for (const data of json.frames) {
      // Convert to normalized UV coordinates
      // Note: UV Y is flipped (0 = bottom, 1 = top) vs image coords (0 = top)
      const normalizedHeight = data.frame.h / atlasHeight
      const frame: SpriteFrame = {
        name: data.filename,
        x: data.frame.x / atlasWidth,
        y: 1 - (data.frame.y / atlasHeight) - normalizedHeight,
        width: data.frame.w / atlasWidth,
        height: normalizedHeight,
        sourceWidth: data.sourceSize.w,
        sourceHeight: data.sourceSize.h,
        rotated: data.rotated,
        trimmed: data.trimmed,
        pivot: data.pivot,
      }

      if (data.trimmed) {
        frame.trimOffset = {
          x: data.spriteSourceSize.x,
          y: data.spriteSourceSize.y,
          width: data.spriteSourceSize.w,
          height: data.spriteSourceSize.h,
        }
      }

      frames.set(data.filename, frame)
    }

    return {
      frames,
      imagePath: json.meta.image,
      width: atlasWidth,
      height: atlasHeight,
    }
  }

  /**
   * Load a texture with the specified options.
   */
  private static loadTexture(url: string, preset: TexturePreset | TextureOptions) {
    return TextureLoader.load(url, { texture: preset })
  }

  /**
   * Create a SpriteSheet object.
   */
  private static createSpriteSheet(
    texture: Texture,
    frames: Map<string, SpriteFrame>,
    width: number,
    height: number
  ): SpriteSheet {
    return {
      texture,
      frames,
      width,
      height,
      getFrame(name: string): SpriteFrame {
        const frame = frames.get(name)
        if (!frame) {
          throw new Error(`Frame not found: ${name}`)
        }
        return frame
      },
      getFrameNames(): string[] {
        return Array.from(frames.keys())
      },
    }
  }

  /**
   * Clear the cache.
   */
  static clearCache() {
    this.cache.clear()
  }

  /**
   * Preload multiple spritesheets.
   */
  static preload(
    urls: string[],
    options?: SpriteSheetLoaderOptions
  ): Promise<SpriteSheet[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }
}
