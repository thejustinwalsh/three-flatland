---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New `@three-flatland/normals` package — offline normal-map baker and runtime loader for the lighting-stochastic-adoption branch.**

### New package — `@three-flatland/normals`

- `NormalMapLoader` — runtime "try baked `.normal.png` → fall back to TSL `normalFromSprite`" loader; exposes both instance API (R3F `useLoader`-compatible) and static API with a shared URL+descriptor-keyed cache
- `resolveNormalMap()` with lazy-loaded in-memory baker fallback (~3 kB, split via `./bake` subpath export, only loaded when fallback fires)
- `NormalSourceDescriptor` for per-region / per-sprite normal configuration
- Stale-hash detection: HEAD 200 + PNG signature range-fetch with no `flatland` tEXt chunk triggers a distinct "stale sidecar" warning
- Dev-time warnings fire at most once per URL, suppressed in `NODE_ENV=production`
- `flatland-bake normal <input.png>` baker contributed via `flatland.bakers` manifest — reads RGBA PNG, computes 4-neighbor alpha gradient, writes sibling `.normal.png`

### API

- `forceRuntime` flag replaces both `skipBakedProbe` and `disableRuntimeBake` (unified with `SlugFontLoader` and all baked-asset loaders)
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` — ecosystem-wide type unification
- `NormalMapLoader._cache` key uses `hashDescriptor(descriptor)` — distinct descriptors for the same URL get separate cache entries (previously the second caller silently won the first caller's bake)
- Instance API bypasses `_cache` intentionally: R3F `useLoader` owns its own suspense cache; double-caching would fight the lifecycle

### BREAKING CHANGES

- `skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` removed — if you asked for normals you get normals (runtime bake is the always-on fallback)

Introduces `@three-flatland/normals` as a complete normal-map pipeline — offline baker, runtime loader, and descriptor-driven resolution with automatic fallback and stale-sidecar detection.
