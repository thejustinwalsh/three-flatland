---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, completing structural type unification across all baked-asset loaders
- Adds `@three-flatland/bake` as a workspace dependency (type-only import — no runtime bundle cost)

Aligns `SlugFontLoader` with the shared `BakedAssetLoaderOptions` type introduced for the normal-map pipeline.
