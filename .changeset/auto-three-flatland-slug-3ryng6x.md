---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, aligning with all other baked-asset loaders in the ecosystem
- Adds `@three-flatland/bake` as a type-only workspace dependency (no runtime cost)

Structural type alignment for `SlugFontLoader` as part of the unified baked-asset loader API.
