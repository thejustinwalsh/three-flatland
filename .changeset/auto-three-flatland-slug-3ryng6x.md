---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/slug

- `SlugFontLoader.load()` now takes `BakedAssetLoaderOptions` directly, unifying the option type with `NormalMapLoader` and all other baked-asset loaders
- Adds `@three-flatland/bake` as a workspace dependency (type-only import, no runtime cost) to enable the structural `BakedAssetLoaderOptions` reference
- `NormalMapLoader._cache` key now uses `hashDescriptor(descriptor)` so callers passing different descriptors for the same URL get distinct cache entries

This patch aligns `SlugFontLoader` with the repo-wide `BakedAssetLoaderOptions` type contract.
