---
"@three-flatland/slug": patch
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### API alignment

- `SlugFontLoader.load()` now accepts `BakedAssetLoaderOptions` directly, aligning it with `NormalMapLoader` and future baked-asset loaders
- Added `@three-flatland/bake` as a workspace dependency (type-only import — no runtime cost)
- Cache key for `NormalMapLoader` now uses `hashDescriptor(descriptor)` instead of presence-only, so two callers passing different descriptors for the same URL get distinct cache entries

No behavior change for existing consumers. Part of the cross-package `BakedAssetLoaderOptions` unification.
