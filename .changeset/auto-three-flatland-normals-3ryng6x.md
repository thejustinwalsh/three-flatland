---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/normals

### New features

- `NormalMapLoader` — runtime loader implementing the canonical "try baked → fall back to runtime TSL" pattern; returns a `Texture` from the sibling `.normal.png` or `null` to trigger the `normalFromSprite` GPU path
  - Instance API (`extends three.Loader`) for R3F `useLoader` compatibility
  - Static API `NormalMapLoader.load(url, { forceRuntime? })` with URL+options-keyed cache
- `NormalSourceDescriptor` support in `NormalMapLoader.load()` — routes through `resolveNormalMap` for the full probe/bake/fallback chain
- `resolveNormalMap` — shared resolution helper: HEAD probe → load baked PNG → lazy CPU bake fallback → dev-time warning (at most once per URL, silent in production)
- Stale-sidecar detection: `probeBakedSibling` checks the `flatland` PNG tEXt chunk hash and warns when the baked file is outdated
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` for structural type unification across all baked-asset loaders
- `NormalMapLoader._cache` keyed on `hashDescriptor(descriptor)` — two callers with different descriptors for the same URL now get independent cache entries

### Breaking changes

- `skipBakedProbe` renamed to `forceRuntime` — update `NormalMapLoader` call sites
- `disableRuntimeBake` removed; runtime bake is always the fallback — pass `forceRuntime: true` to skip the baked probe instead

### Bug fixes

- Type-aware lint errors resolved (unused imports, `import type`, `Array<ArrayBuffer>`, `JSON.parse` typed as `unknown`)

Introduces the `@three-flatland/normals` runtime loader and offline baker, completing the normal-map pipeline from `flatland-bake normal` to in-scene usage.
