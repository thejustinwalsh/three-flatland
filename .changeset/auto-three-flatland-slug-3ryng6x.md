---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `SlugFontLoader.load()` now takes `BakedAssetLoaderOptions` directly, aligning it with the shared baked-asset loader option type used by `NormalMapLoader` and all other loaders
- Added `@three-flatland/bake` as a workspace dependency (type-only import — no runtime cost)

`SlugFontLoader` now participates in the unified baked-asset loader contract end-to-end.