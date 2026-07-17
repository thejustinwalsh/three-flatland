import { Loader, type LoadingManager, TextureLoader, type Texture } from 'three'
import {
  devtimeWarn as sharedDevtimeWarn,
  _resetDevtimeWarnings as sharedResetDevtimeWarnings,
  hashDescriptor,
  type BakedAssetLoaderOptions,
} from '@three-flatland/bake'
import { bakedNormalURL } from './bake.js'
import type { NormalSourceDescriptor } from './descriptor.js'

/**
 * Options accepted by `NormalMapLoader.load()`. Inherits `forceRuntime`
 * from the shared {@link BakedAssetLoaderOptions} so every baked-asset
 * loader in the codebase advertises the same option shape.
 */
export interface NormalMapLoaderStaticOptions extends BakedAssetLoaderOptions {
  /**
   * When provided, missing sidecars trigger an in-memory bake via
   * `resolveNormalMap`. Without a descriptor, `NormalMapLoader.load()` can
   * only probe the baked sibling and returns `null` on miss (legacy
   * behavior, preserved for backward compat).
   */
  descriptor?: NormalSourceDescriptor
}

/**
 * Result of loading a sprite's normal data.
 *
 * Either a baked normal texture (fast path) or `null`, signalling the caller
 * to use the runtime TSL `normalFromSprite` helper against the sprite's own
 * alpha channel.
 */
export type NormalMapResult = Texture | null

/**
 * Loader for per-sprite normal maps following the canonical three-flatland
 * "try baked → fall back to runtime" pattern documented in
 * `planning/bake/loader-pattern.md`.
 *
 * Given a sprite PNG URL, this loader fetches the sibling `.normal.png` that
 * `flatland-bake normal` produces. If it is absent, the loader resolves to
 * `null` so the lit material can switch to its TSL runtime fallback.
 *
 * Only the baked path uses the network — the runtime branch is a shader
 * concern and lives in `@three-flatland/nodes/lighting/normalFromSprite`.
 *
 * @example
 * ```ts
 * // Vanilla static API
 * const normalTex = await NormalMapLoader.load('/sprites/knight.png')
 * if (normalTex) material.normalMap = normalTex
 * else material.useRuntimeNormals = true
 *
 * // Skip the baked probe — go straight to runtime (or null without descriptor)
 * const tex = await NormalMapLoader.load(url, { forceRuntime: true })
 *
 * // R3F useLoader
 * const tex = useLoader(NormalMapLoader, '/sprites/knight.png')
 * ```
 */
export class NormalMapLoader extends Loader<NormalMapResult> {
  /**
   * Generate this asset's normal map in the browser on every load
   * instead of loading a pre-baked `.normal.png` sidecar. With a
   * `descriptor`, the in-memory bake runs on every load. Without a
   * descriptor, the loader resolves directly to `null` and the caller
   * uses the TSL runtime fallback. Suppresses the "no baked sibling"
   * warn either way.
   *
   * Use when runtime is the right home for the bake. Not a dev-iteration
   * knob — the default path (probe → bake on miss + warn) already
   * handles iteration. See {@link BakedAssetLoaderOptions.forceRuntime}.
   */
  forceRuntime = false
  /**
   * When set, missing sidecars trigger an in-memory bake via
   * `resolveNormalMap`. Without a descriptor, the loader can only probe
   * the baked sibling and returns `null` on miss (legacy behavior).
   *
   * Set via the `useLoader` callback:
   * ```ts
   * useLoader(NormalMapLoader, url, undefined, (l) => { l.descriptor = desc })
   * ```
   */
  descriptor: NormalSourceDescriptor | undefined = undefined

  constructor(manager?: LoadingManager) {
    super(manager)
  }

  // ─── Instance API (R3F useLoader compatibility) ───

  load(
    url: string,
    onLoad?: (data: NormalMapResult) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): NormalMapResult {
    const resolved = this.manager.resolveURL(url)

    NormalMapLoader._loadImpl(resolved, this.forceRuntime, this.descriptor)
      .then((result) => {
        onLoad?.(result)
      })
      .catch((err) => {
        if (onError) onError(err)
        else console.error('NormalMapLoader:', err)
        this.manager.itemError(url)
      })

    return null
  }

  loadAsync(url: string): Promise<NormalMapResult> {
    return NormalMapLoader._loadImpl(this.manager.resolveURL(url), this.forceRuntime, this.descriptor)
  }

  // ─── Static API (vanilla usage) ───

  /**
   * Vanilla cache: keyed by `(url, forceRuntime, descriptor hash)` so
   * two callers passing *different* descriptors for the same URL get
   * distinct results instead of colliding on the first one's bake.
   *
   * Instance API (R3F `useLoader`) bypasses this map — R3F has its own
   * suspense cache and we don't want double-caching to fight the lifecycle.
   */
  private static _cache = new Map<string, Promise<NormalMapResult>>()

  static load(url: string, options?: NormalMapLoaderStaticOptions): Promise<NormalMapResult> {
    const forceRuntime = options?.forceRuntime ?? false
    const descriptor = options?.descriptor
    // Hash the descriptor so distinct descriptors for the same URL get
    // distinct cache entries. `descriptor ? 'desc' : 'nodesc'` would have
    // collapsed every (URL, *) pair into one slot — first-bake-wins.
    const descriptorKey = descriptor ? hashDescriptor(descriptor) : 'nodesc'
    const cacheKey = `${url}:${forceRuntime ? 'runtime' : 'probe'}:${descriptorKey}`
    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const promise = this._loadImpl(url, forceRuntime, descriptor)
    this._cache.set(cacheKey, promise)
    return promise
  }

  static clearCache(): void {
    this._cache.clear()
  }

  // ─── Implementation ───

  private static async _loadImpl(
    url: string,
    forceRuntime: boolean,
    descriptor: NormalSourceDescriptor | undefined
  ): Promise<NormalMapResult> {
    // With a descriptor we can do the full resolve: try baked → in-memory bake.
    if (descriptor) {
      const { resolveNormalMap } = await import('./resolveNormalMap.js')
      return resolveNormalMap(url, descriptor, { forceRuntime })
    }

    // No descriptor → legacy URL-only behavior: probe sidecar, return null on miss.
    if (!forceRuntime) {
      const baked = await this._tryLoadBaked(url)
      if (baked) return baked
    }

    sharedDevtimeWarn(
      'normal',
      url,
      `No baked normal sibling for ${url} and no descriptor passed. ` +
        `Either pre-bake (\`npx flatland-bake normal\`), pass a \`descriptor\` to ` +
        `NormalMapLoader.load() for in-memory bake, or use SpriteSheetLoader/LDtkLoader ` +
        `with \`normals: true\` (which synthesizes a descriptor for you).`
    )
    return null
  }

  private static async _tryLoadBaked(spriteURL: string): Promise<Texture | null> {
    const bakedURL = bakedNormalURL(spriteURL)

    // Probe with HEAD first so a 404 stays silent. TextureLoader swallows
    // network errors into a generic event, which is not what we want.
    let head: Response
    try {
      head = await fetch(bakedURL, { method: 'HEAD' })
    } catch {
      return null
    }
    if (!head.ok) return null

    return new Promise((resolve, _reject) => {
      const loader = new TextureLoader()
      loader.load(
        bakedURL,
        (tex) => resolve(tex as unknown as Texture),
        undefined,
        (err) => {
          console.warn(`[normal] Found ${bakedURL} via HEAD but TextureLoader failed — falling back to runtime.`, err)
          resolve(null)
        }
      )
    })
  }
}

/** Clear the devtime-warning dedupe set. Intended for tests. */
export function _resetDevtimeWarnings(): void {
  sharedResetDevtimeWarnings()
}
