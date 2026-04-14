---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/normals`**

- `flatland-bake normal <sprite.png> [output.png] [--strength N]` — offline Node.js CLI tool that reads an RGBA PNG, computes the 4-neighbor alpha gradient, and writes a tangent-space normal map as a sibling `.normal.png`; eliminates per-fragment alpha samples + gradient cost at runtime
- Baker integrates with `@three-flatland/bake` via the `flatland.bakers` manifest — installing the package makes the subcommand appear in `flatland-bake --list` automatically

**NormalMapLoader**

- Runtime "try baked → fall back to `normalFromSprite`" loader
- Instance API (R3F `useLoader`-compatible) extends `three.Loader`
- Static API for vanilla Three.js: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL-keyed cache
- Silent HEAD probe: 404 falls through to runtime TSL path without console noise
- Dev-time warning (suppressed in `NODE_ENV=production`) fires at most once per URL when the runtime path is taken

This release ships the complete normal-map pipeline: offline bake → loader → runtime fallback.
