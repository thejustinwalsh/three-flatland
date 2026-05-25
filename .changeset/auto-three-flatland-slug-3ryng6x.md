---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/slug

### Changes

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly — type-only import of `@three-flatland/bake`, no runtime cost
- Completes end-to-end structural unification: every baked-asset loader in the ecosystem references the same option type, not just the same field name

Aligns `SlugFontLoader` with the shared `BakedAssetLoaderOptions` type used by `NormalMapLoader`, `SpriteSheetLoader`, and the LDtk/Tiled loaders.
