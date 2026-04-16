---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/bake`**

- New `flatland-bake` CLI binary — single entry point that discovers and dispatches to bakers contributed by any installed npm/workspace package
- Bakers are declared in `package.json` under `flatland.bakers[].entry`; installing a package with this manifest makes its subcommand appear in `flatland-bake --list` with no manual wiring
- Discovery walks `node_modules` upward from CWD, tolerates scoped packages, missing dirs, and malformed manifests; duplicate names use first-wins with a conflict warning
- CWD self-discovery: when the CLI runs inside a package that itself declares bakers, those are registered first, enabling author iteration without symlinking

**Normal-map baker integration**

- `flatland-bake normal <sprite.png>` bakes a sibling `.normal.png` using the same 4-neighbor alpha-gradient algorithm as the runtime `normalFromSprite` TSL helper
- Optional `--strength <n>` multiplier; output path defaults to `<input>.normal.png`
- Installing `@three-flatland/normals` automatically registers the `normal` subcommand

`@three-flatland/bake` is the extensible offline asset pipeline for the flatland ecosystem; baking normals (and future slug/font atlases) moves per-fragment GPU work to build time.
