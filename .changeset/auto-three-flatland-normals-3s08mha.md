---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package** — `@three-flatland/normals` provides offline normal-map baking and runtime loading for sprite assets.

**Normal-map baker**
- Node.js baker: reads RGBA PNG, computes 4-neighbor alpha gradient, normalizes to tangent-space, writes sibling `.normal.png`
- Contributes `flatland-bake normal` subcommand via `flatland.bakers` manifest — `flatland-bake normal sprite.png [out.png] [--strength n]`
- Eliminates four alpha-sample + gradient cost per fragment at runtime when the baked PNG is available

**NormalMapLoader** (runtime)
- Instance API: extends `three.Loader`; R3F `useLoader`-compatible
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL+`forceRuntime`-keyed cache
- Canonical "try baked → fall back to runtime" pattern: HEAD probe keeps 404 silent; dev-time warning fires at most once per URL outside `NODE_ENV=production`; successful HEAD with failed `TextureLoader` warns and falls through to `normalFromSprite` TSL path

**Lighting example** (post-rebase)
- New `examples/react/lighting` showcasing `castsShadow` sprites, wandering light-emitting characters, flickering torches, and keyboard-controlled hero via `DefaultLightEffect`

New `@three-flatland/normals` package delivers a complete normal-map pipeline from offline baking to runtime loading with graceful fallback to the existing TSL shader path.
