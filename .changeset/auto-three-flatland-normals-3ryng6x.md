---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New `@three-flatland/normals` package** — offline normal-map baking and runtime loading for sprite-based 2D scenes.

**Offline baker**
- `flatland-bake normal sprite.png` reads an RGBA PNG, computes a 4-neighbor alpha-gradient tangent-space normal, and writes a sibling `.normal.png`
- Accepts `--strength <n>` to scale the normal intensity
- Registers automatically via `flatland.bakers` manifest — no extra wiring needed

**NormalMapLoader (runtime)**
- Instance API (R3F `useLoader`-compatible) and static API (`NormalMapLoader.load(url, options)`)
- Canonical probe → baked → runtime-bake fallback chain: HEAD probe checks for the sibling `.normal.png`; on miss, falls back to CPU bake via `resolveNormalMap`
- `NormalSourceDescriptor` route: pass a descriptor to `load()` for the full resolution chain without losing the legacy URL-only path
- Baker is lazy-imported (`~/bake` subpath, ~3 kB) and only lands in the consumer bundle when the runtime-bake path actually fires
- Cache key is descriptor-hashed so multiple callers with different descriptors for the same URL get independent cache entries

**resolveNormalMap**
- `forceRuntime: true` skips the baked probe and goes straight to runtime bake
- Previously `skipBakedProbe` (renamed); `disableRuntimeBake` dropped
- Stale hash detection: when a baked sidecar exists but its embedded hash does not match, a distinct "stale" dev-time warning fires

**`NormalMapLoaderStaticOptions` type**
- Extends the shared `BakedAssetLoaderOptions` from `@three-flatland/bake`, unifying the option surface across the ecosystem

**Bug fixes**
- Type-aware lint fixes throughout (unused imports removed, `import type` used correctly, IndexedDB rejections wrapped in `Error`)

This release ships `@three-flatland/normals` with a complete bake → load pipeline: run `flatland-bake normal` at build time to pre-generate normal maps, and let `NormalMapLoader` serve the baked texture at runtime with automatic runtime-bake fallback when sidecars are absent.
