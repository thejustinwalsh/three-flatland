# Canonical Loader Pattern — try baked → fall back to runtime

This is the one loader shape used across three-flatland for any asset that can
be either pre-computed offline or produced at runtime from a source. When a new
package needs this behaviour, copy the shape below. Each consumer owns its own
code — there is deliberately no shared loader helper package. The pattern is
small enough that duplication is cheaper than coupling.

## When to use it

Any loader whose output can be produced by two paths:

- **Baked**: a sibling asset on disk, emitted by `flatland-bake <subcommand>`.
- **Runtime**: the same algorithm, executed from the source asset at load time
  (or per-frame in a shader when the loader only needs to resolve "baked or
  skip").

Examples live in-tree:

- `@three-flatland/slug` — `SlugFontLoader` tries `.slug.json` + `.slug.bin`,
  falls back to parsing the TTF with opentype.js.
- `@three-flatland/normals` — ships the baker today. Runtime fallback is the
  TSL helper `normalFromSprite` executed per-fragment in the lit material.

## The shape

```ts
import { Loader } from 'three'

export class ExampleLoader extends Loader<Example> {
  /** Skip baked data and always run the runtime path. */
  forceRuntime = false

  // ─── Instance API (R3F useLoader compatibility) ───
  load(url, onLoad, onProgress, onError) {
    const resolved = this.manager.resolveURL(url)
    const placeholder = {} as Example
    ExampleLoader._loadImpl(resolved, this.forceRuntime)
      .then((v) => { onLoad?.(v) })
      .catch((err) => {
        if (onError) onError(err)
        else console.error('ExampleLoader:', err)
        this.manager.itemError(url)
      })
    return placeholder
  }

  loadAsync(url) {
    return ExampleLoader._loadImpl(this.manager.resolveURL(url), this.forceRuntime)
  }

  // ─── Static API (vanilla usage) ───
  private static _cache = new Map<string, Promise<Example>>()

  static load(url: string, options?: { forceRuntime?: boolean }): Promise<Example> {
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
  private static async _loadImpl(url: string, forceRuntime: boolean): Promise<Example> {
    if (!forceRuntime) {
      const baked = await this._tryLoadBaked(url)
      if (baked) return baked
    }
    devtimeWarn('example', url)
    return this._loadRuntime(url)
  }
}
```

## Conventions every loader must follow

### 1. `forceRuntime` flag

Both the instance (`this.forceRuntime`) and static (`options.forceRuntime`)
surfaces accept it. Cache keys include the flag (`${url}:runtime`) so a mixed
consumer doesn't cross-contaminate.

### 2. URL derivation

Sibling paths, same directory, same basename, different extension. Query
strings preserved. Case-insensitive on the source extension.

```ts
'/sprites/knight.png'       → '/sprites/knight.normal.png'
'/sprites/knight.png?v=3'   → '/sprites/knight.normal.png?v=3'
'/fonts/Inter-Regular.ttf'  → '/fonts/Inter-Regular.slug.json' + '.slug.bin'
```

Ship the derivation as a named export (`bakedNormalURL`, `bakedURLs`) so
callers can probe without instantiating a loader.

### 3. Dev-time warning

Emitted once per runtime-path resolution, only outside production:

```ts
function devtimeWarn(kind: string, url: string): void {
  if (typeof process === 'undefined') return
  if (process.env?.['NODE_ENV'] === 'production') return
  console.warn(
    `[${kind}] Generating data at runtime for ${url}. ` +
    `Bake with \`npx flatland-bake ${kind}\` for production.`
  )
}
```

Keep the exact message shape — one line, bracket-prefixed with the subcommand
name, pointing at `flatland-bake <subcommand>`. Grep consistency matters.

### 4. Cache at the static API

Results are cached by URL (plus the `:runtime` suffix when forced). The
instance API delegates to the static `_loadImpl`, so the cache is shared.

### 5. Silent fall-through on missing baked

If the baked fetch 404s, return `null` from `_tryLoadBaked` without logging —
the runtime fallback will handle it. Only warn when the runtime path actually
runs. `404` on the source asset is a hard error and should throw.

If the baked fetch succeeds but the payload is corrupt or the version doesn't
match, log a `warn` so the user knows they have a stale bake, then fall back.

### 6. Version gating

Baked payloads carry a `version` field in their JSON header. Bump on breaking
changes. The loader rejects older versions and falls back with a warning so
a stale bake doesn't silently mis-render.

### 7. No cross-package shared helper

Each loader inlines the ~30 lines above. The alternative — a
`@three-flatland/loader-kit` package — was rejected: the pattern is small, and
each consumer has different unpack/cache/version semantics, so the shared
surface would be trivial and the package would add ceremony without savings.
If we grow past 5 loaders with identical guts, revisit.

## Baker-side contract

Every loader has a corresponding baker that follows the
`@three-flatland/bake` `Baker` contract (`{ name, description, run, usage? }`)
and is registered via the `flatland.bakers` field in `package.json`. See
`packages/bake/src/types.ts` for the interface. Bakers must be Node-runnable
only — no `three`, no `@react-three/fiber` dependencies.

## Checklist for a new loader

- [ ] Baker implements `Baker` contract, default-exports it
- [ ] `package.json` declares the baker under `flatland.bakers`
- [ ] Exports a `baked<Name>URL(src: string): string` derivation helper
- [ ] Loader class extends `three.Loader<T>`
- [ ] Has `forceRuntime` on both instance and static APIs
- [ ] Static `load()` caches with `forceRuntime`-aware keys + `clearCache()`
- [ ] `_tryLoadBaked` returns `null` on 404, warns on version/payload errors
- [ ] Emits the `[kind] Generating data at runtime …` warning exactly once per
      resolution, only outside `NODE_ENV=production`
- [ ] Baked payload header includes an integer `version` field with a bump
      policy documented in the package README
