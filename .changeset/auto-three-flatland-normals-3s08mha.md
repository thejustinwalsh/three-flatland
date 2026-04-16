---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**NormalMapLoader** (runtime):
- Try-baked-then-runtime pattern: loads sibling `.normal.png` (produced by `flatland-bake normal`), falls back to TSL `normalFromSprite` path with a once-per-URL dev-time warning (suppressed in production)
- Instance API extending `three.Loader`, compatible with R3F `useLoader`
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with shared URL+forceRuntime-keyed cache
- Silent HEAD probe keeps 404s from logging errors; a HEAD success followed by `TextureLoader` failure warns and falls through

**Normal-map baker** (build tool):
- `flatland-bake normal <input.png>`: offline tangent-space normal map from RGBA sprite alpha via 4-neighbor gradient; writes `.normal.png` sibling
- `--strength` option for gradient scale
- Contributed via `package.json` `flatland.bakers` manifest — auto-registers when `@three-flatland/normals` is installed

`@three-flatland/normals` delivers both the offline bake tool and the runtime loader for the full baked-normal pipeline.
