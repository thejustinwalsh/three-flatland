# @three-flatland/normals

## 0.1.0-alpha.2

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27
  - New `@three-flatland/normals` package: offline normal-map baker that reads RGBA PNG sprites, computes 4-neighbor alpha gradient normals, and writes a sibling `.normal.png`
  - `flatland-bake normal <sprite.png> [output.png] [--strength N]` available automatically once the package is installed
  - `NormalMapLoader`: runtime loader implementing the "try baked → fall back to runtime TSL `normalFromSprite`" pattern
    - Instance API compatible with R3F `useLoader`; static API for vanilla Three.js
    - Accepts an optional `NormalSourceDescriptor` to route through `resolveNormalMap` for the full fallback chain
    - `forceRuntime: true` skips the baked-asset probe and goes straight to runtime bake
    - Cache keyed by `hashDescriptor(descriptor)` — distinct descriptors for the same URL get separate cache entries
  - Lazy-loads the baker module (`./bake.js`, ~3 KB) only when the runtime fallback actually fires
  - Stale-hash detection: warns distinctly when the sidecar exists but its embedded hash doesn't match the source sprite
  - Type-aware lint cleanup across the normals package

  ## BREAKING CHANGES
  - `skipBakedProbe` renamed to `forceRuntime` on `NormalMapLoader` and `ResolveNormalMapOptions`
  - `disableRuntimeBake` removed; use `forceRuntime: true` instead

  Introduces `@three-flatland/normals` for offline normal-map baking and a full runtime fallback loader pipeline.

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

### Patch Changes

- Updated dependencies [dea6d18]
- Updated dependencies [2db36c9]
  - @three-flatland/bake@0.1.0-alpha.2
