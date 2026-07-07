import { Loader } from 'three'
import type { Texture } from 'three'
import type {
  SpriteSheet,
  SpriteFrame,
  SpriteFrameMesh,
  SpriteSheetFrameMeshJSON,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
  SpriteAnimation,
  AsepriteFrameTag,
  AtlasAnimation,
} from '../sprites/types'
import { degradeAtlasMesh, registerAtlasMesh } from './atlasMeshRegistry'
import type { BakedAssetLoaderOptions } from '@three-flatland/bake'
import {
  resolveNormalMap,
  type NormalSourceDescriptor,
  type NormalRegion,
} from '@three-flatland/normals'
import { type TexturePreset, type TextureOptions, resolveTextureOptions } from './texturePresets'
import { TextureLoader } from './TextureLoader'
import { resolveAlphaMap } from '../events/resolveAlphaMap'
import { AlphaMap } from '../events/AlphaMap'

/**
 * Shape accepted by `SpriteSheetLoaderOptions.normals`.
 *
 * - `false` — no normals generated.
 * - `true` — auto-synthesize one region per frame.
 * - `NormalSourceDescriptor` — user provides defaults (and optionally
 *   regions). Frame-derived regions fill in when `regions` is absent.
 */
export type SpriteSheetNormalsOption = false | true | NormalSourceDescriptor

/**
 * Options for loading a spritesheet.
 */
export interface SpriteSheetLoaderOptions extends BakedAssetLoaderOptions {
  /** Texture preset or custom options. Overrides loader and global defaults. */
  texture?: TexturePreset | TextureOptions
  /**
   * Normal-map generation. When truthy, the loader synthesizes one
   * region per sprite frame (pixel rects from the sheet JSON), probes
   * for a baked `<sheet-image>.normal.png` sibling with a matching
   * descriptor hash, and falls back to an in-memory bake.
   *
   * The resulting texture is attached to `SpriteSheet.normalMap`,
   * 1:1 co-registered with the atlas.
   */
  normals?: SpriteSheetNormalsOption
  /**
   * Alpha hitmask generation. When `true`, the loader probes for a
   * baked `<sheet-image>.alpha.png` sidecar and falls back to a
   * runtime readback via `AlphaMap.fromTexture`.
   *
   * The resulting map is attached to `SpriteSheet.alphaMap` and
   * consumed by `hitTestMode: 'alpha'`. Spec §8.4.
   */
  alpha?: boolean
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
   * Normal-map generation. See {@link SpriteSheetLoaderOptions.normals}.
   */
  normals: SpriteSheetNormalsOption = false

  /**
   * Alpha hitmask generation. See {@link SpriteSheetLoaderOptions.alpha}.
   */
  alpha = false

  /**
   * Generate this sheet's normal map in the browser on every load
   * instead of loading a pre-baked sidecar. The in-memory bake runs on
   * every load; the sidecar probe and "no baked sibling" warn are
   * skipped. Not a dev-iteration knob.
   * See {@link BakedAssetLoaderOptions.forceRuntime}.
   */
  forceRuntime = false

  /**
   * Load a spritesheet asynchronously (for R3F useLoader compatibility).
   * Presets are automatically applied.
   */
  loadAsync(url: string): Promise<SpriteSheet> {
    const resolved = resolveTextureOptions(this.preset, SpriteSheetLoader.options)
    return SpriteSheetLoader.loadUncached(url, {
      texture: resolved,
      normals: this.normals,
      alpha: this.alpha,
      forceRuntime: this.forceRuntime,
    })
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
    // Sidecar flags change the produced sheet (normalMap / alphaMap), so they
    // are part of the cache identity — otherwise a `{ alpha: true }` load and a
    // bare load of the same URL collide and one silently gets the wrong sheet.
    const sidecarKey = JSON.stringify({
      normals: options?.normals ?? false,
      alpha: options?.alpha ?? false,
      forceRuntime: options?.forceRuntime ?? false,
    })
    return `${url}:${optionsKey}:${sidecarKey}`
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

    // Create SpriteSheet
    const sheet = this.createSpriteSheet(
      texture,
      parsed.frames,
      animations,
      parsed.width,
      parsed.height
    )

    // Resolve normal map — probe baked sibling, fall back to in-memory bake.
    if (options?.normals) {
      sheet.normalMap = await this.resolveSheetNormals(
        textureUrl,
        parsed.frames,
        parsed.width,
        parsed.height,
        options.normals,
        options.forceRuntime ?? false,
        texture.flipY
      )
    }

    // Resolve alpha hitmask — probe baked sidecar, fall back to runtime readback.
    if (options?.alpha) {
      const alphaMap = await resolveAlphaMap(textureUrl, {
        forceRuntime: options.forceRuntime ?? false,
        runtimeFallback: () => Promise.resolve(AlphaMap.fromTexture(sheet.texture)),
      })
      if (alphaMap) sheet.alphaMap = alphaMap
    }

    return sheet
  }

  /**
   * Synthesize a descriptor from the sheet's frame rects and hand it
   * to `resolveNormalMap`. One region per frame — region-local alpha
   * clamping keeps adjacent frames from bleeding gradients into each
   * other.
   */
  private static async resolveSheetNormals(
    textureUrl: string,
    frames: Map<string, SpriteFrame>,
    atlasWidth: number,
    atlasHeight: number,
    optionDescriptor: true | NormalSourceDescriptor,
    forceRuntime: boolean,
    diffuseFlipY: boolean
  ): Promise<Texture> {
    // Convert each frame's normalized UV back to pixel coords. Frames
    // parsed via `parseJSONHash` store Y flipped (0 = bottom) — undo
    // that here so regions stay in image-space (0 = top).
    const regions: NormalRegion[] = []
    for (const frame of frames.values()) {
      const x = Math.round(frame.x * atlasWidth)
      const w = Math.round(frame.width * atlasWidth)
      const h = Math.round(frame.height * atlasHeight)
      const yImage = Math.round((1 - frame.y - frame.height) * atlasHeight)
      regions.push({ x, y: yImage, w, h })
    }

    const base: NormalSourceDescriptor = optionDescriptor === true ? {} : optionDescriptor
    const descriptor: NormalSourceDescriptor = {
      ...base,
      regions: base.regions && base.regions.length > 0 ? base.regions : regions,
    }

    return resolveNormalMap(textureUrl, descriptor, {
      forceRuntime,
      flipY: diffuseFlipY,
    })
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
      // Rotated frames (TexturePacker 90° CW) occupy a swapped-dims
      // region in the atlas: JSON w/h describe the unrotated sprite,
      // the packed rect is (h × w) — pixi's convention.
      const rectW = data.rotated ? data.frame.h : data.frame.w
      const rectH = data.rotated ? data.frame.w : data.frame.h
      const normalizedHeight = rectH / atlasHeight
      const frame: SpriteFrame = {
        name,
        x: data.frame.x / atlasWidth,
        y: 1 - data.frame.y / atlasHeight - normalizedHeight,
        width: rectW / atlasWidth,
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

      frame.mesh = SpriteSheetLoader.parseFrameMesh(data, frame)

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
      imagePath: json.meta.sources?.[0]?.uri ?? json.meta.image ?? '',
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
      const rectW = data.rotated ? data.frame.h : data.frame.w
      const rectH = data.rotated ? data.frame.w : data.frame.h
      const normalizedHeight = rectH / atlasHeight
      const frame: SpriteFrame = {
        name: data.filename,
        x: data.frame.x / atlasWidth,
        y: 1 - data.frame.y / atlasHeight - normalizedHeight,
        width: rectW / atlasWidth,
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

      frame.mesh = SpriteSheetLoader.parseFrameMesh(data, frame)

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
      imagePath: json.meta.sources?.[0]?.uri ?? json.meta.image ?? '',
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
    const sheet: SpriteSheet = {
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

    // Concatenate per-frame mesh data into sheet-level arrays and stamp
    // each frame's offsets — the layout the tight-mesh render path (and
    // a future vertex-shader mesh table) indexes into.
    let vertexTotal = 0
    let indexTotal = 0
    const meshed: SpriteFrame[] = []
    for (const frame of frames.values()) {
      if (!frame.mesh) continue
      meshed.push(frame)
      vertexTotal += frame.mesh.vertexCount
      indexTotal += frame.mesh.indices.length
    }
    if (meshed.length > 0) {
      const meshVerts = new Float32Array(vertexTotal * 4)
      const meshIndices = new Uint16Array(indexTotal)
      let vOff = 0
      let iOff = 0
      for (const frame of meshed) {
        const mesh = frame.mesh!
        mesh.vertexOffset = vOff
        mesh.indexOffset = iOff
        meshVerts.set(mesh.verts, vOff * 4)
        meshIndices.set(mesh.indices, iOff)
        vOff += mesh.vertexCount
        iOff += mesh.indices.length
      }
      sheet.meshVerts = meshVerts
      sheet.meshIndices = meshIndices
      registerAtlasMesh(texture, {
        frames: meshed,
        complete: meshed.length === frames.size,
      })
    } else {
      // A meshless sheet sharing a texture with a previously-registered
      // meshed sheet: its frames are unknown to the envelope — degrade
      // it toward the full quad so nothing clips.
      degradeAtlasMesh(texture)
    }

    return sheet
  }

  /**
   * Normalize a frame's optional polygon payload to a SpriteFrameMesh.
   *
   * Two accepted inputs:
   * - our own \`mesh\` field — already local [-0.5, 0.5] + frame-local
   *   UV [0, 1], pre-triangulated; passed through
   * - TexturePacker polygon-trim output (\`vertices\`/\`triangles\` in
   *   source-image pixels, y-down) — normalized here. Frame-local UVs
   *   are derived from the vertex position within the (trimmed) frame
   *   rect, so the shader's instanceUV atlas remap applies unchanged.
   */
  private static parseFrameMesh(
    data: SpriteSheetFrameMeshJSON,
    frame: SpriteFrame
  ): SpriteFrameMesh | null {
    if (data.mesh && data.mesh.verts.length >= 3 && data.mesh.indices.length >= 3) {
      const count = data.mesh.verts.length
      const verts = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) {
        const [x, y, u, v] = data.mesh.verts[i]!
        verts[i * 4 + 0] = x
        verts[i * 4 + 1] = y
        verts[i * 4 + 2] = u
        verts[i * 4 + 3] = v
      }
      return {
        verts,
        indices: Uint16Array.from(data.mesh.indices),
        vertexCount: count,
        vertexOffset: 0,
        indexOffset: 0,
      }
    }

    if (data.vertices && data.triangles && data.vertices.length >= 3) {
      // Rotated frames pack 90°-turned in the atlas; the quad path
      // doesn't rotate its sampling yet, and deriving rotated
      // frame-local UVs here would desync from it. Fall back to the
      // quad for rotated frames — correctness over overdraw.
      if (frame.rotated) return null
      const sourceW = frame.sourceWidth
      const sourceH = frame.sourceHeight
      const trim = frame.trimOffset ?? { x: 0, y: 0, width: sourceW, height: sourceH }
      const count = data.vertices.length
      const verts = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) {
        const [px, py] = data.vertices[i]!
        // Source-image pixels (y-down) → unit-quad locals (y-up)
        verts[i * 4 + 0] = px / sourceW - 0.5
        verts[i * 4 + 1] = 0.5 - py / sourceH
        // Frame-local UV relative to the (trimmed) packed rect, v-up
        verts[i * 4 + 2] = (px - trim.x) / trim.width
        verts[i * 4 + 3] = 1 - (py - trim.y) / trim.height
      }
      const indices = new Uint16Array(data.triangles.length * 3)
      for (let i = 0; i < data.triangles.length; i++) {
        const [a, b, c] = data.triangles[i]!
        indices[i * 3 + 0] = a
        // TexturePacker triangles are wound for y-down screen space —
        // the y flip above mirrors them, so swap to keep CCW front faces.
        indices[i * 3 + 1] = c
        indices[i * 3 + 2] = b
      }
      return {
        verts,
        indices,
        vertexCount: count,
        vertexOffset: 0,
        indexOffset: 0,
      }
    }

    return null
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
  static preload(urls: string[], options?: SpriteSheetLoaderOptions): Promise<SpriteSheet[]> {
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
