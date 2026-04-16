---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/normals` — offline normal-map baker and runtime loader**

- `flatland-bake normal <sprite.png>` bakes tangent-space normal maps from RGBA sprite alpha: computes 4-neighbor gradient, normalizes, writes sibling `.normal.png`; optional `--strength` multiplier
- `NormalMapLoader` implements the canonical "try baked → fall back to runtime `normalFromSprite`" pattern:
  - Instance API (R3F `useLoader` compatible) extends `three.Loader`
  - Static API (`NormalMapLoader.load(url, { forceRuntime? })`) with shared URL-keyed cache
  - Silent HEAD probe for 404; dev-time warn-once when runtime fallback is taken (suppressed in `NODE_ENV=production`)
- Package declares `flatland.bakers` manifest so `flatland-bake normal` is auto-discovered by `@three-flatland/bake` with no additional wiring

Delivers the full normal-map pipeline from offline bake to runtime load, with graceful fallback to the TSL `normalFromSprite` path.
