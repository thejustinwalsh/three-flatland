---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, matching the unified loader interface introduced in `@three-flatland/bake`
- Adds `@three-flatland/bake` as a workspace dependency (type-only import, no runtime cost)

`SlugFontLoader` now shares the same `forceRuntime` option shape as every other baked-asset loader in the ecosystem.

