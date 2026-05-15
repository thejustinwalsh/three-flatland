---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Package: `@three-flatland/normals`

- `flatland-bake normal <input.png>` — Node-runnable baker that reads an RGBA PNG, computes the 4-neighbor alpha gradient, normalizes to tangent-space normals, and writes a sibling `.normal.png`; optional `--strength` multiplier
- Package contributes a `flatland.bakers` manifest so the subcommand appears in `flatland-bake --list` automatically
- Region-aware baking (`bakeRegions`) for sprite sheets with multiple frames

## Runtime Loader

- `NormalMapLoader` — implements the canonical "try baked → fall back to runtime TSL" pattern
  - Instance API: extends `three.Loader`, compatible with R3F `useLoader`
  - Static API: `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL-keyed cache
  - HEAD probe to silently handle missing `.normal.png` files; falls through to `normalFromSprite` TSL path on 404
  - Dev-time warnings fire at most once per URL when the runtime path is taken, suppressed in `NODE_ENV=production`

## Normal Descriptor

- `.normal.json` descriptor format for associating baked normal maps with sprite sheets; parsed by `descriptor.ts`
- `resolveNormalMap` utility for deriving baked-asset URLs from sprite sheet paths

Introduces `@three-flatland/normals` with an offline baker and a runtime loader that prefers pre-baked normals and falls back gracefully to the shader-computed path.
