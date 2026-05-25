---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/slug

### Changes

- `SlugFontLoader.load()` now takes `BakedAssetLoaderOptions` directly, aligning with the shared baked-asset loader option type used across the ecosystem
- Adds `@three-flatland/bake` as a workspace dependency (type-only import; no runtime cost)

This patch completes the `BakedAssetLoaderOptions` unification so `SlugFontLoader` participates in the same structural option contract as `NormalMapLoader`, `SpriteSheetLoader`, and the tilemap loaders.
