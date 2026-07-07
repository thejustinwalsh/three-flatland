# @three-flatland/bake

## 0.1.0-alpha.2

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27
  - New `@three-flatland/bake` package: extensible `flatland-bake` CLI with plugin-based baker discovery via `"flatland": { "bake": [...] }` in `package.json`
  - Discovery walks `node_modules` upward from CWD; tolerates scoped packages, missing dirs, and malformed manifests; CWD self-discovery lets package authors iterate without symlinks
  - Installing `@three-flatland/normals` automatically registers `flatland-bake normal <input.png>` as a subcommand
  - Normal descriptor loader and sidecar write support added to bake infrastructure
  - Unified baked-asset loader opt-out: `skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` removed (runtime bake is always the fallback when normals are requested)
  - USAGE help text corrected to reference canonical `flatland.bake` field instead of legacy `flatland.bakers`
  - `setState` inside `useFrame` in the lighting example deferred via `queueMicrotask` to prevent mid-frame re-renders
  - Dead `&& header.status !== 206` guard removed from `sidecar.ts` (redundant with `!header.ok`)

  ## BREAKING CHANGES
  - `skipBakedProbe` renamed to `forceRuntime` in `BakedAssetLoaderOptions` and all loader option types
  - `disableRuntimeBake` option removed; use `forceRuntime: true` instead

  Introduces the `flatland-bake` CLI and unifies all baked-asset loader options under a single `forceRuntime` flag.

- 2db36c9: ## Unify baked-asset loader runtime flag as `forceRuntime`

  Every baked-asset loader in the codebase now exposes the same single flag — `forceRuntime: true` — declaring that the browser is where this asset's derived data is produced (instead of a CI bake step). The contract is unchanged: if you ask for the data, you get it. The flag only chooses _where_ generation happens. Mirrors `SlugFontLoader.forceRuntime`, which is the canonical pattern.

  ### Renames
  - `BakedAssetLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `SpriteSheetLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `LDtkLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `TiledLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `NormalMapLoader.skipBakedProbe` (instance + static `load()`) → `forceRuntime`
  - `ResolveNormalMapOptions.skipBakedProbe` → `forceRuntime`

  ### Removed
  - `LDtkLoaderOptions.disableRuntimeBake` (+ instance property)
  - `SpriteSheetLoaderOptions.disableRuntimeBake` (+ instance property)
  - `NormalMapLoader.disableRuntimeBake` (instance + static `load()` option)
  - `ResolveNormalMapOptions.disableRuntimeBake`

  The previous `disableRuntimeBake` flag conflated two intents into a second option. The unified model is simpler: **opt in to normals (`normals: true | descriptor`), and they're guaranteed to load** — baked sidecar if available, in-memory bake on miss, devtime warn when the runtime path fires. There is no "no normals" fallback; the engine never silently fails on a missing asset.

  `forceRuntime: true` is the project-level architectural choice for a specific asset: the browser is where its normal map is produced, on every load, no sidecar exists for it by design. Use for procedurally varied content, throwaway prototypes, or lean bundles. **Not** a dev-iteration knob; the default path (probe → bake on miss + warn) already handles iteration.

  ### Migration

  ```diff
  - SpriteSheetLoader.load(url, { normals: true, skipBakedProbe: true })
  + SpriteSheetLoader.load(url, { normals: true, forceRuntime: true })

  - SpriteSheetLoader.load(url, { normals: { disableRuntimeBake: true } })
  + SpriteSheetLoader.load(url, { normals: true })  // runtime bake is now always the fallback
  ```
