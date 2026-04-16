---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New `@three-flatland/normals` package:**
- `flatland-bake normal <sprite.png>`: Node-runnable normal-map baker; reads RGBA PNG, computes 4-neighbor alpha gradient, writes sibling `.normal.png`; `--strength` option scales the gradient
- `NormalMapLoader`: runtime loader implementing the canonical "try baked → fall back to runtime TSL" pattern; HEAD-probes for `.normal.png` to avoid 404 noise; returns `Texture | null`; dev-time warn-once on fallback (suppressed in production)
- Instance API extending `three.Loader` (R3F `useLoader`-compatible) and static API `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL-keyed cache
- `@three-flatland/bake` CWD-self-discovery: CLI registers its own package's bakers first, enabling local iteration without symlinking

`@three-flatland/normals` provides offline normal-map baking via `flatland-bake normal` and a runtime loader that transparently prefers pre-baked textures over per-fragment TSL computation.
