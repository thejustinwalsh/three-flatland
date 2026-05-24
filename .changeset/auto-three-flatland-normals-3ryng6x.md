---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### New package

`@three-flatland/normals` provides the offline normal-map baker and the runtime loader:

**Offline baker** (`flatland-bake normal`):
- Reads an RGBA PNG, computes the 4-neighbor alpha gradient, normalizes to tangent space, writes a sibling `.normal.png`
- Contributes a `flatland.bake` manifest so `flatland-bake normal sprite.png` works after install with no extra wiring
- `--strength` flag scales the gradient before normalization

**Runtime loader** (`NormalMapLoader`):
- Implements the canonical "try baked → fall back to runtime TSL `normalFromSprite`" pattern
- Instance API (R3F `useLoader`-compatible, extends `three.Loader`) and static API (`NormalMapLoader.load(url, opts)`) with a shared URL+descriptor-keyed cache
- HEAD probe keeps 404 silent; fallback fires at most once per URL outside `NODE_ENV=production`
- Accepts an optional `NormalSourceDescriptor` to route through `resolveNormalMap` for the full fallback chain

**`resolveNormalMap()`**:
- Lazy-imports the baker (~3 kB) so it only lands in consumer bundles when the runtime fallback actually fires
- `forceRuntime: true` skips the baked probe entirely (use in prod where every sidecar must ship)

### API changes

- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` — structural unification with `SlugFontLoader` and the core loaders
- Cache key uses `hashDescriptor(descriptor)` (not presence-only); two callers with different descriptors for the same URL get distinct cache entries
- `disableRuntimeBake` option removed; `forceRuntime` is the single opt-out flag across all loaders
- `skipBakedProbe` renamed to `forceRuntime` throughout

Introduces `@three-flatland/normals` with offline baking and a runtime loader that transparently falls back to in-memory TSL normal generation when a sidecar is missing.
