import { type Texture, TextureLoader } from 'three'
import type {
  SpriteSheet,
  SpriteFrame,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
} from '../sprites/types'

/**
 * Loader for spritesheet JSON files.
 *
 * Supports:
 * - JSON Hash format (TexturePacker default)
 * - JSON Array format
 *
 * @example
 * ```typescript
 * const sheet = await SpriteSheetLoader.load('/sprites/player.json');
 * const frame = sheet.getFrame('player_idle_0');
 * ```
 */
export class SpriteSheetLoader {
  private static textureLoader = new TextureLoader()
  private static cache = new Map<string, Promise<SpriteSheet>>()

  /**
   * Load a spritesheet from a JSON file.
   * Results are cached by URL.
   */
  static load(url: string): Promise<SpriteSheet> {
    // Return cached promise if exists
    if (this.cache.has(url)) {
      return this.cache.get(url)!
    }

    const promise = this.loadUncached(url)
    this.cache.set(url, promise)
    return promise
  }

  /**
   * Load without caching.
   */
  private static async loadUncached(url: string): Promise<SpriteSheet> {
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

    // Load texture
    const texture = await this.loadTexture(textureUrl)

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
   * Load a texture.
   */
  private static loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          // Configure texture for pixel art (optional, can be overridden)
          texture.generateMipmaps = false
          resolve(texture)
        },
        undefined,
        reject
      )
    })
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
  static preload(urls: string[]): Promise<SpriteSheet[]> {
    return Promise.all(urls.map((url) => this.load(url)))
  }
}
