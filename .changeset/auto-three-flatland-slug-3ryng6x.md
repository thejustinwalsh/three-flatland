---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, unifying the opt-out flag pattern across all baked-asset loaders; `@three-flatland/bake` added as a workspace dependency (type-only import, no runtime cost)
- `NormalMapLoader` cache key now uses `hashDescriptor(descriptor)` rather than descriptor presence — two calls with different descriptors for the same URL resolve to distinct cache entries

Aligns `SlugFontLoader` with the `BakedAssetLoaderOptions` structural type shared by all Flatland baked-asset loaders.
