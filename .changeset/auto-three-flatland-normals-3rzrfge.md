---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### New package: `@three-flatland/normals`

**Offline baker (`flatland-bake normal`)**
- Reads an RGBA sprite PNG, computes a 4-neighbor alpha gradient, and writes a sibling `.normal.png` (tangent-space normal map)
- Registered via `flatland.bakers` manifest; `flatland-bake normal <sprite.png> [out.png] [--strength N]` appears automatically when the package is installed
- Bakes regions independently for sprite sheets; eliminates per-fragment alpha sampling + gradient at runtime

**Runtime loader (`NormalMapLoader`)**
- Instance API extending `three.Loader` — compatible with R3F `useLoader`
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL-keyed cache
- Implements canonical "try baked → fall back to runtime" shape: silent 404 probe, `normalFromSprite` TSL fallback, dev-time warning (once per URL, suppressed in production)

This release delivers both the offline normal-map baking pipeline and the runtime loader that consumes baked PNGs or falls back to TSL shader computation.
