---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New package: `@three-flatland/normals`**

- Offline normal-map baker: reads RGBA PNG, computes 4-neighbor alpha gradient, outputs tangent-space `.normal.png` (available as `flatland-bake normal <sprite.png>`)
- `NormalMapLoader` — runtime "try baked → fall back to runtime TSL" loader implementing the canonical loader pattern
  - Instance API extending `three.Loader` (compatible with R3F `useLoader`)
  - Static API: `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL+option-keyed cache
  - Silent HEAD probe for 404; dev-time warning on runtime fallback (suppressed under `NODE_ENV=production`)
- Post-rebase fixes: unused import cleanup in `baker.ts`, hoisted inline `import()` type annotations to named `import type`

`@three-flatland/normals` covers the full round-trip from offline baking to runtime loading, with a graceful fallback to the `normalFromSprite` TSL path when no baked file is present.
