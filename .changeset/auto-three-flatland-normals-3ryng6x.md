---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Normal-map offline baking**
- `flatland-bake normal <input.png>` CLI command bakes tangent-space normals from an RGBA sprite's alpha gradient to a sibling `.normal.png`, skipping four per-fragment alpha samples at runtime
- `--strength <n>` flag scales the gradient before normalizing (default 1)
- Node-runnable baker is a direct port of the `normalFromSprite` TSL helper; output is pixel-identical to the runtime path

**NormalMapLoader — runtime "baked first" loader**
- `NormalMapLoader.load(url, { forceRuntime? })` (vanilla) and `useLoader(NormalMapLoader, url)` (R3F) — tries the sibling `.normal.png`, falls back to runtime TSL `normalFromSprite` path silently on 404
- Dev-time warning fires at most once per URL when the runtime fallback is taken; silent in `NODE_ENV=production`
- Shared URL+forceRuntime-keyed cache; instance API extends `three.Loader` for R3F `useLoader` compatibility

**Normal descriptor integration**
- `.normal.json` descriptor format for sprite-sheet region normal maps; descriptor loader resolves per-region normal texture or falls back to runtime baker
- `NormalMapLoader` and descriptor loader both registered in Flatland's loader pipeline for LDtk and Tiled maps

Initial release of `@three-flatland/normals`: offline baking + runtime loader pair for sprite normal maps, following the canonical Flatland bake/load pattern.
