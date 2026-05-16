import { Loader, type LoadingManager, TextureLoader, type Texture } from 'three'
import {
  devtimeWarn as sharedDevtimeWarn,
  _resetDevtimeWarnings as sharedResetDevtimeWarnings,
} from '@three-flatland/bake'
import { bakedNormalURL } from './bake.js'
import type { NormalSourceDescriptor } from './descriptor.js'

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
   * Opt this asset out of the baked-sibling pattern entirely. With a
   * `descriptor`, the in-memory bake runs on every load. Without a
   * descriptor, the loader resolves directly to `null` — caller is
   * expected to use the TSL runtime fallback. Suppresses the "no baked
   * sibling" warn either way.
   *
   * Use when an asset is intentionally never baked. Not a dev-iteration
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
    return NormalMapLoader._loadImpl(
      this.manager.resolveURL(url),
      this.forceRuntime,
      this.descriptor
    )
  }

  // ─── Static API (vanilla usage) ───

  private static _cache = new Map<string, Promise<NormalMapResult>>()

  static load(
    url: string,
    options?: {
      forceRuntime?: boolean
      /**
       * When provided, missing sidecars trigger an in-memory bake via
       * `resolveNormalMap`. Without a descriptor, NormalMapLoader can only
       * probe the baked sibling and returns null on miss (legacy behavior,
       * preserved for backward compat).
       */
      descriptor?: NormalSourceDescriptor
    }
  ): Promise<NormalMapResult> {
    const forceRuntime = options?.forceRuntime ?? false
    const descriptor = options?.descriptor
    const cacheKey = `${url}:${forceRuntime ? 'runtime' : 'probe'}:${descriptor ? 'desc' : 'nodesc'}`
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
          console.warn(
            `[normal] Found ${bakedURL} via HEAD but TextureLoader failed — falling back to runtime.`,
            err
          )
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
