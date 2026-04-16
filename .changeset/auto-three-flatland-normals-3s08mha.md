---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/normals`**

- Offline normal-map baker: reads an RGBA PNG sprite, computes 4-neighbor alpha-gradient normals (same algorithm as the runtime `normalFromSprite` TSL helper), and writes a sibling `.normal.png`
- Registered as a `flatland-bake normal` subcommand — no manual wiring required after `npm install @three-flatland/normals`
- Optional `--strength <n>` flag to scale the baked normal intensity

**Runtime loader**

- `NormalMapLoader` implements the canonical "try baked → fall back to runtime" pattern for normal maps
- Instance API: extends `three.Loader`, compatible with R3F `useLoader`
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL-keyed cache
- Silent 404 on missing `.normal.png`; dev-time warning (once per URL, not in production) when falling back to the runtime TSL path

**Lighting example rebuild**

- `examples/react/lighting` rebuilt against the current API: dungeon tilemap, castsShadow sprite walls, wandering knights + slimes as point lights, keyboard-controlled hero, Tweakpane devtools panel

`@three-flatland/normals` completes the offline normal-map pipeline: bake at build time with `flatland-bake normal`, load at runtime with `NormalMapLoader`, fall back to `normalFromSprite` TSL automatically.
