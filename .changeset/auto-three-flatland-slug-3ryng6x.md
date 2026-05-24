---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**`SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions`**
- Unified with the shared option type used by `NormalMapLoader`, `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader`
- `@three-flatland/bake` added as a workspace dependency (type-only import, no runtime cost)

This patch aligns `SlugFontLoader` with the ecosystem-wide `forceRuntime` opt-out pattern.
