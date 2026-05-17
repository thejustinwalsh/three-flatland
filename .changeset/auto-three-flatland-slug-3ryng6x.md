---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `SlugFontLoader.load()` now takes `BakedAssetLoaderOptions` directly — type-only dependency on `@three-flatland/bake`, no runtime cost
- Aligns `SlugFontLoader` with the unified `forceRuntime` option pattern used by all other baked-asset loaders in the ecosystem

`@three-flatland/slug` gains structural type consistency with the rest of the baked-asset loader family.
