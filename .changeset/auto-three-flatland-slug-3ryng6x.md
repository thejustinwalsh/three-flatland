---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

- `SlugFontLoader.load()` options parameter now typed as `BakedAssetLoaderOptions` directly, unifying it with `NormalMapLoaderStaticOptions` and the rest of the baked-asset loader ecosystem
- Adds `@three-flatland/bake` as a workspace dependency (type-only import — no runtime cost)

Aligns `SlugFontLoader` with the ecosystem-wide `BakedAssetLoaderOptions` interface.
