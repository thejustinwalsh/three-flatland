---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `NormalMapLoader`: runtime normal-map loader implementing the "try baked → fallback to runtime" pattern
  - Instance API (R3F `useLoader`-compatible) and static API with URL+descriptor-keyed cache
  - Silent HEAD probe for 404; warns once per URL in development when the runtime TSL path is taken
  - Accepts `NormalSourceDescriptor` to route through the full `resolveNormalMap` fallback chain
- `resolveNormalMap()`: full fallback chain — sidecar probe, stale-hash detection, runtime in-memory bake, and flat `DataTexture` fallback
- `flatland-bake normal` CLI baker: Node-side port of the `normalFromSprite` TSL helper
  - Reads RGBA PNG, computes 4-neighbor alpha gradient → tangent-space normal map
  - Writes sibling `.normal.png`; `--strength` multiplier option
- Baker integrates with `@three-flatland/bake` discovery: `flatland.bake` manifest auto-registers `flatland-bake normal`
- Lazy-loaded baker: `bakeInMemory` dynamic-imports `./bake.js` — only included in consumer bundles when the fallback actually fires
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` for structural type unification across all baked-asset loaders
- Cache key uses `hashDescriptor(descriptor)` — two callers with different descriptors for the same URL get distinct cache entries
- Stale-hash branch: distinct dev warning when sidecar exists but hash does not match
- Fixed: type-aware lint errors across devtools and normals (unused vars/imports, IndexedDB error wrapping, etc.)

**BREAKING CHANGES**

- `skipBakedProbe` renamed to `forceRuntime` across `NormalMapLoader`, `resolveNormalMap`, `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`
- `disableRuntimeBake` removed; runtime bake is always the fallback when normals are requested — use `forceRuntime: true` to skip the sidecar probe entirely

Full normal-map pipeline for offline baking and runtime fallback: `NormalMapLoader` with baked-first resolution, a `flatland-bake normal` CLI baker, and unified `forceRuntime` opt-out across all baked-asset loaders.
