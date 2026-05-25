---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, structurally unifying it with all other baked-asset loaders (`NormalMapLoader`, `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`)
- `@three-flatland/bake` added as a workspace dev dependency (type-only import, no runtime cost)

`SlugFontLoader` now shares the `BakedAssetLoaderOptions` type end-to-end with the rest of the baked-asset loader ecosystem.
