# @three-flatland/normals

## 0.1.0-alpha.3

### Minor Changes

- 9b04cfa: > Branch: worktree-events-system

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/125

  ### c03dd167fcabfbc0f0ce6f52a4b43159d8585da5

  feat: extract the alpha hitmask baker into its own package
  Each flatland-bake baker is meant to be a small grab-it-when-you-need-it
  package, not a tenant of an unrelated one. The alpha baker had been
  parked in @three-flatland/normals (which already owned PNG decode), but
  the name was misleading — normals now shipped a non-normal baker.

  Move the alpha baker into a new @three-flatland/alphamap package: the
  `flatland-bake alpha` subcommand, bakeAlphaMapFile, and the
  ALPHA_DESCRIPTOR. The runtime side (AlphaMap, resolveAlphaMap) stays in
  three-flatland/events, decoupled by the re-declared descriptor literal —
  no cross-package import either way. normals goes back to a single
  `normal` baker.

  Shared deps move to the workspace catalog (pngjs, @types/pngjs); both
  baker packages reference catalog:. Discovery is unchanged — the bake CLI
  finds whichever bakers are installed via their package.json flatland.bake
  manifest, so consumers install only the baker they need.
  Files: docs/src/content/docs/examples/hit-test.mdx, docs/src/content/docs/guides/baking.mdx, packages/alphamap/README.md, packages/alphamap/package.json, packages/alphamap/src/bake.node.test.ts, packages/alphamap/src/bake.node.ts, packages/alphamap/src/cli.ts, packages/alphamap/src/descriptor.ts, packages/alphamap/src/index.ts, packages/alphamap/src/node.ts, packages/alphamap/tsconfig.json, packages/alphamap/tsup.config.ts, packages/normals/package.json, packages/normals/src/alphaBake.node.ts, packages/normals/src/alphaBake.test.ts, packages/normals/src/alphaCli.ts, packages/three-flatland/src/events/resolveAlphaMap.ts, pnpm-lock.yaml, pnpm-workspace.yaml
  Stats: 19 files changed, 283 insertions(+), 121 deletions(-)

  ### f48d546b9a12b1b1ec839f9dd70d70226dd4ac0c

  feat: register flatland-bake alpha baker writing stamped .alpha.png sidecars
  Files: packages/normals/package.json, packages/normals/src/alphaBake.node.ts, packages/normals/src/alphaBake.test.ts, packages/normals/src/alphaCli.ts
  Stats: 4 files changed, 113 insertions(+)

- 6caf0f8: > Branch: worktree-events-system

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/125

  ### c20a94769ce8028c3ae08efc0570e8f00610d5ef

  feat: register flatland-bake alpha baker writing stamped .alpha.png sidecars
  Files: packages/normals/package.json, packages/normals/src/alphaBake.node.ts, packages/normals/src/alphaBake.test.ts, packages/normals/src/alphaCli.ts
  Stats: 4 files changed, 113 insertions(+)

- 192774c: > Branch: preview/tools-combined

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/172

  ## Normal Baker schema
  - New `NormalSourceDescriptor` JSON Schema + `validateNormalDescriptor()` (in `@three-flatland/schemas/normal-descriptor`), following the atlas schema's conventions: hand-authored `packages/normals/src/descriptor.ts` type stays authoritative, schema conforms to it, and the schema is published to `docs/public/schemas/normal-descriptor.v1.json` via `pnpm sync:docs:schemas` — kept out of `gen:types` so the browser-safe normals bundle never pulls in Ajv
  - Tightened integer constraints (x/y/w/h) and synced the published docs schema copy, with new invalid-fixture tests (fractional x/y/w/h) in both the schemas validator suite and the normals type<->schema parity suite

  ## Normal Baker editor (VSCode)
  - Added a per-field "reset to inherited" affordance (bump/direction/pitch/strength/elevation) in `RegionPropertiesPanel`, restoring the ability to clear an explicit field override that was lost when normalize-on-save was reversed
  - Extracted the bake/write/rename/cleanup sequence out of `sidecar.ts` into a pure, unit-testable `atomicPublish.ts`; covers the success path plus three injected-failure paths, confirming temp files are cleaned up and final files are never touched on error
  - Verified the elevation preview formula against the runtime lighting implementation (`DefaultLightEffect.ts`); confirmed exact match and documented the one known divergence (positional vs. orbit-direction XY)
  - Strengthened the e2e save-round-trip spec with exact PNG tEXt-stamp hash equality and an independently-derived pixel check against a real fixture region
  - `RegionListPanel`'s raw reorder buttons converted to `ToolbarButton` for design-system compliance

  ## Summary

  Adds a JSON Schema + validator for the Normal Baker's descriptor format (mirroring the atlas schema pattern) and hardens the Normal Baker editor: a reset-to-inherited affordance, an atomically-tested bake/write/rename pipeline, verified elevation math, and stricter round-trip test coverage.

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
