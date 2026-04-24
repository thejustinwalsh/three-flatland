---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/normals` package: offline normal-map baker that ports the `normalFromSprite` TSL shader to Node.js
- Reads an RGBA PNG, computes 4-neighbor alpha gradient, normalizes to tangent-space, and writes a sibling `.normal.png` — consumers load the baked texture directly instead of paying per-fragment alpha sampling at runtime
- Contributed `flatland.bakers` manifest makes `flatland-bake normal <input.png>` available as soon as the package is installed; optional `--strength` flag controls normal exaggeration
- `NormalMapLoader` — runtime loader implementing the canonical "try baked → fall back to runtime `normalFromSprite`" pattern; issues dev-time warnings (at most once per URL, suppressed in production) when falling back
  - Instance API: extends `three.Loader`, compatible with R3F `useLoader`
  - Static API: `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL-keyed cache
- Normal map descriptor format (`.normal.json`) supported alongside direct `.normal.png` consumption
- Region-aware baking (`bakeRegions`) for sprite-sheet inputs

`@three-flatland/normals` provides both build-time baking and runtime loading for sprite normal maps, enabling deferred normal-map computation that integrates with the Flatland lighting pipeline.
