import { Loader, type LoadingManager, TextureLoader, type Texture } from 'three'
import { bakedNormalURL } from './bake.js'

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
 * // Force the runtime path (skip baked probe)
 * const tex = await NormalMapLoader.load(url, { forceRuntime: true })
 *
 * // R3F useLoader
 * const tex = useLoader(NormalMapLoader, '/sprites/knight.png')
 * ```
 */
export class NormalMapLoader extends Loader<NormalMapResult> {
  /** Skip the baked probe; always resolve to `null` (use runtime path). */
  forceRuntime = false

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

    NormalMapLoader._loadImpl(resolved, this.forceRuntime)
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
      this.forceRuntime
    )
  }

  // ─── Static API (vanilla usage) ───

  private static _cache = new Map<string, Promise<NormalMapResult>>()

  static load(
    url: string,
    options?: { forceRuntime?: boolean }
  ): Promise<NormalMapResult> {
    const forceRuntime = options?.forceRuntime ?? false
    const cacheKey = forceRuntime ? `${url}:runtime` : url
    const cached = this._cache.get(cacheKey)
    if (cached) return cached

    const promise = this._loadImpl(url, forceRuntime)
    this._cache.set(cacheKey, promise)
    return promise
  }

  static clearCache(): void {
    this._cache.clear()
  }

  // ─── Implementation ───

  private static async _loadImpl(
    url: string,
    forceRuntime: boolean
  ): Promise<NormalMapResult> {
    if (!forceRuntime) {
      const baked = await this._tryLoadBaked(url)
      if (baked) return baked
    }

    devtimeWarn(url)
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

let _warned = new Set<string>()

function devtimeWarn(url: string): void {
  if (typeof process === 'undefined') return
  if (process.env?.['NODE_ENV'] === 'production') return
  if (_warned.has(url)) return
  _warned.add(url)
  console.warn(
    `[normal] Generating data at runtime for ${url}. ` +
      `Bake with \`npx flatland-bake normal\` for production.`
  )
}

/** Clear the devtime-warning dedupe set. Intended for tests. */
export function _resetDevtimeWarnings(): void {
  _warned = new Set<string>()
}
