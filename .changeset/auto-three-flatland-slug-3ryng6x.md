---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Baked-asset loader option unification for the lighting-stochastic-adoption branch.**

- `SlugFontLoader.load()` options now extend `BakedAssetLoaderOptions` from `@three-flatland/bake` (type-only import, zero runtime cost), unifying the option shape across all baked-asset loaders in the ecosystem

Aligns `SlugFontLoader` with the ecosystem-wide `BakedAssetLoaderOptions` contract introduced by `@three-flatland/bake`.
