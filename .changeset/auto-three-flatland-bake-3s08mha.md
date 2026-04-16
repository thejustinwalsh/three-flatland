---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `flatland-bake` binary — discovers and dispatches to bakers contributed by workspace or npm packages via a `package.json` `flatland.bakers` manifest
- Baker discovery walks `node_modules` upward from CWD; CWD-self-discovery lets package authors iterate without symlinking their own package
- `flatland-bake --list` enumerates all discovered bakers; first-wins conflict detection for duplicate names
- `flatland-bake normal <input.png>` bakes a tangent-space normal map from RGBA sprite alpha using a 4-neighbor gradient; `--strength` option scales the gradient
- Output written as a sibling `.normal.png`; runtime consumers load it directly as a texture

`@three-flatland/bake` introduces the extensible `flatland-bake` CLI and the first concrete baker for offline normal-map generation.
