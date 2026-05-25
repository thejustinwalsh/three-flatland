---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### Normal map baking

- New `@three-flatland/normals` package: offline normal-map baker (`flatland-bake normal <input.png>`) that ports the `normalFromSprite` TSL helper to Node — reads an RGBA PNG, computes 4-neighbor alpha gradient, writes a tangent-space `.normal.png` sidecar
- Registers as a `flatland.bake` baker so it appears in `flatland-bake --list` automatically after install
- Baker is lazy-loaded: the ~3kB bake module only enters consumer bundles when the runtime fallback actually fires

### Runtime loader

- New `NormalMapLoader`: implements the canonical "try baked → fall back to runtime" pattern; returns a `Texture` from the sibling `.normal.png` or `null` to signal the caller to use `normalFromSprite` at runtime
- Instance API (R3F `useLoader` compatible) and static API (`NormalMapLoader.load(url, opts)`) with a shared URL+descriptor-keyed cache
- `NormalMapLoader.load()` now accepts an optional `NormalSourceDescriptor` for the full fallback chain; without one, preserves legacy URL-only behavior (silent HEAD probe, warn on miss)

### `resolveNormalMap`

- `resolveNormalMap()` + `NormalMapLoader.load()` options unified under `BakedAssetLoaderOptions` as `NormalMapLoaderStaticOptions` — structural type shared across every baked-asset loader
- Renamed `skipBakedProbe` → `forceRuntime` across `BakedAssetLoaderOptions`, `NormalMapLoader`, and `resolveNormalMap` (matches `SlugFontLoader.forceRuntime`)
- Dropped `disableRuntimeBake` entirely; runtime bake is now the unconditional fallback when normals are requested — opt out via `forceRuntime: true`
- Cache key uses `hashDescriptor(descriptor)` so two callers with different descriptors for the same URL get distinct cache entries
- Stale-sidecar detection: HEAD 200 without a matching `flatland` tEXt chunk emits a distinct "stale sidecar" warning

### Bug fixes

- Resolved type-aware lint errors: unused vars/imports dropped, `import type` conversions, `IndexedDB` promise rejections wrapped in `Error`

`@three-flatland/normals` provides the full normal-map pipeline: offline bake via CLI, descriptor-driven runtime loader, and automatic fallback to the TSL `normalFromSprite` path with dev-time warnings.
