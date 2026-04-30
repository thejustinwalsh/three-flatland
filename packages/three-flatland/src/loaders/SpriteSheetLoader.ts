import { Loader } from 'three'
import type { Texture } from 'three'
import type {
  SpriteSheet,
  SpriteFrame,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
  SpriteAnimation,
  AsepriteFrameTag,
  AtlasAnimation,
} from '../sprites/types'
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
 * // Three.js usage - static API
 * const sheet = await SpriteSheetLoader.load('/sprites/player.json');
 *
 * // R3F usage - works with useLoader
 * import { SpriteSheetLoader } from 'three-flatland/react';
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
  // Static API for Three.js usage
  // ==========================================

  /**
   * Load a spritesheet from a JSON file (static method for Three.js usage).
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

    // Animation source priority — highest first:
    //   1. `meta.animations` (our richer shape; preferred when present)
    //   2. `meta.frameTags` + per-frame `duration` (Aseprite shape)
    //   3. none (TexturePacker output without extensions)
    const orderedFrameNames = parsed.orderedFrameNames
    const frameDurations = parsed.frameDurations
    const animations = parseAnimations(json.meta, orderedFrameNames, frameDurations)

    return this.createSpriteSheet(texture, parsed.frames, animations, parsed.width, parsed.height)
  }

  /**
   * Parse JSON Hash format. Returns the ordered frame names + per-frame
   * durations alongside the frame map so the animation parser can
   * resolve Aseprite `frameTags` (which use integer indices into the
   * frames array — relies on insertion order being preserved).
   */
  private static parseJSONHash(json: SpriteSheetJSONHash) {
    const frames = new Map<string, SpriteFrame>()
    const orderedFrameNames: string[] = []
    const frameDurations = new Map<string, number>()
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
      orderedFrameNames.push(name)
      if (typeof data.duration === 'number' && data.duration > 0) {
        frameDurations.set(name, data.duration)
      }
    }

    return {
      frames,
      orderedFrameNames,
      frameDurations,
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
    const orderedFrameNames: string[] = []
    const frameDurations = new Map<string, number>()
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
      orderedFrameNames.push(data.filename)
      if (typeof data.duration === 'number' && data.duration > 0) {
        frameDurations.set(data.filename, data.duration)
      }
    }

    return {
      frames,
      orderedFrameNames,
      frameDurations,
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
    animations: Map<string, SpriteAnimation>,
    width: number,
    height: number
  ): SpriteSheet {
    return {
      texture,
      frames,
      animations,
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
      getAnimation(name: string): SpriteAnimation | undefined {
        return animations.get(name)
      },
      getAnimationNames(): string[] {
        return Array.from(animations.keys())
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

/**
 * Normalize the source JSON metadata into a Map of `SpriteAnimation`s,
 * regardless of whether the source uses our `meta.animations` shape or
 * Aseprite's `meta.frameTags` + per-frame durations. Returns an empty
 * Map for plain TexturePacker output (no animation metadata).
 *
 * Source priority:
 *   1. `meta.animations` (our shape) — preferred when present.
 *   2. `meta.frameTags` (Aseprite shape) — converted to our shape via
 *      direction → loop/pingPong, integer indices → frame names,
 *      median per-frame duration → fps.
 */
function parseAnimations(
  meta: SpriteSheetJSONHash["meta"],
  orderedFrameNames: readonly string[],
  frameDurations: ReadonlyMap<string, number>
): Map<string, SpriteAnimation> {
  const out = new Map<string, SpriteAnimation>()

  // Preferred source: our richer `meta.animations`.
  if (meta.animations && Object.keys(meta.animations).length > 0) {
    for (const [name, anim] of Object.entries(meta.animations)) {
      out.set(name, atlasAnimationToSpriteAnimation(anim))
    }
    return out
  }

  // Fallback: Aseprite-style `meta.frameTags` + per-frame `duration`.
  if (meta.frameTags && meta.frameTags.length > 0) {
    for (const tag of meta.frameTags) {
      const sa = frameTagToSpriteAnimation(tag, orderedFrameNames, frameDurations)
      if (sa) out.set(tag.name, sa)
    }
  }
  return out
}

function atlasAnimationToSpriteAnimation(anim: AtlasAnimation): SpriteAnimation {
  // Dereference indexed wire format → flat name-based playback
  // sequence. Out-of-bounds indices are skipped with a console
  // warning — schema validation should catch these upstream.
  const frames: string[] = []
  for (const idx of anim.frames) {
    const name = anim.frameSet[idx]
    if (name == null) {
      console.warn(
        `[three-flatland] AtlasAnimation: frame index ${idx} out of bounds ` +
          `for frameSet (length ${anim.frameSet.length}); skipping.`,
      )
      continue
    }
    frames.push(name)
  }
  return {
    frames,
    fps: anim.fps ?? 12,
    loop: anim.loop ?? true,
    pingPong: anim.pingPong ?? false,
    ...(anim.events ? { events: { ...anim.events } } : {}),
  }
}

function frameTagToSpriteAnimation(
  tag: AsepriteFrameTag,
  orderedFrameNames: readonly string[],
  frameDurations: ReadonlyMap<string, number>
): SpriteAnimation | null {
  if (tag.from < 0 || tag.to >= orderedFrameNames.length || tag.from > tag.to) return null
  const slice = orderedFrameNames.slice(tag.from, tag.to + 1)
  if (slice.length === 0) return null

  const dir = tag.direction ?? "forward"
  const reverseInPlace = dir === "reverse" || dir === "pingpong_reverse"
  const isPingPong = dir === "pingpong" || dir === "pingpong_reverse"
  const frames = reverseInPlace ? [...slice].reverse() : slice

  // Median per-frame duration (ms) → fps. Frames without a recorded
  // duration default to 100ms (10 fps) — the typical Aseprite default.
  const durations = slice
    .map((n) => frameDurations.get(n))
    .filter((d): d is number => typeof d === "number" && d > 0)
    .sort((a, b) => a - b)
  const medianMs = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : 100
  const fps = Math.max(1, Math.round(1000 / medianMs))

  return { frames, fps, loop: true, pingPong: isPingPong }
}
