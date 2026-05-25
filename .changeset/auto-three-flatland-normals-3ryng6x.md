---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

- New `@three-flatland/normals` package: offline Node-runnable baker (`flatland-bake normal <sprite.png>`) that computes tangent-space normals from the alpha 4-neighbor gradient and writes a sibling `.normal.png`
- `NormalMapLoader`: runtime loader implementing the canonical "try baked → runtime TSL fallback" pattern; supports instance API (R3F `useLoader`) and static API with a shared URL-keyed cache
- `resolveNormalMap()`: full fallback chain — silent 404 probe, lazy-imported `bakeInMemory` (~3 kB, only bundled when the fallback fires), devtime warn once per URL
- `NormalSourceDescriptor` support: per-region baking via `bakeRegions` and descriptor JSON
- `NormalMapLoader.load()` options typed as `NormalMapLoaderStaticOptions extends BakedAssetLoaderOptions` — structurally unified with all other baked-asset loaders
- Cache key uses `hashDescriptor(descriptor)` — distinct descriptors for the same URL get separate cache entries (previously the second caller silently received the first caller's result)
- Stale-hash detection: warns when a sidecar is present but its `flatland` tEXt chunk hash doesn't match, distinguishing stale from missing

## Breaking Changes

- `skipBakedProbe` renamed to `forceRuntime` on `ResolveNormalMapOptions` and `NormalMapLoader`
- `disableRuntimeBake` removed — runtime bake is always the fallback when normals are requested; use `forceRuntime: true` to skip the probe and fall back without baking

`@three-flatland/normals` provides offline CLI baking and a runtime loader that falls back to on-the-fly TSL baking for sprite normal maps.
