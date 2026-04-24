---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

NEW PACKAGE. Everything listed below is additive.

**Offline baker**
- Reads an RGBA PNG, computes a 4-neighbor alpha gradient, normalizes to tangent-space, and writes a sibling `.normal.png`
- Registered with `flatland.bakers` so `flatland-bake normal` appears automatically after install
- `--strength` option scales the gradient before normalization
- `flatland-bake normal sprite.png` / `flatland-bake normal sprite.png out.normal.png --strength 2`

**Runtime loader**
- `NormalMapLoader` implements the canonical "try baked → fall back to runtime TSL `normalFromSprite`" pattern
- Instance API extends `three.Loader` for R3F `useLoader` compatibility
- Static API: `NormalMapLoader.load(url, { forceRuntime? })` with a shared URL+option-keyed cache
- Silent HEAD probe: a 404 for the `.normal.png` silently falls through to the runtime path
- Dev-time warning fires at most once per URL when the runtime fallback is taken (suppressed in `NODE_ENV=production`)

**Descriptor**
- `NormalMapDescriptor` format and `descriptor.ts` parser for per-region normal-map sidecar files produced by the baker

New `@three-flatland/normals` package providing an offline normal-map baker and a `NormalMapLoader` that transparently falls back from pre-baked PNG to the runtime TSL path.
