---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Offline baker:**
- `flatland-bake normal <input.png>` CLI subcommand: reads RGBA PNG, computes 4-neighbor alpha gradient, normalizes to tangent-space, writes sibling `.normal.png`
- Optional `--strength` flag to scale gradient intensity
- Contributed via `flatland.bakers` manifest — no wiring required after install

**Runtime loader:**
- `NormalMapLoader`: extends `three.Loader` for R3F `useLoader` compatibility; also exposes `NormalMapLoader.load(url, opts)` static API for vanilla Three.js
- Transparently tries the baked `.normal.png` first (silent HEAD probe on 404), falls back to runtime `normalFromSprite` TSL path on missing file or load failure
- Dev-time warnings fire at most once per URL on fallback; suppressed in `NODE_ENV=production`
- `forceRuntime` option to bypass the baked path unconditionally
- URL+`forceRuntime`-keyed shared cache for the static API
- Canonical loader pattern documented in `planning/bake/loader-pattern.md`

Adds the `@three-flatland/normals` package with an offline CLI baker and a `NormalMapLoader` that transparently serves pre-baked normal maps with a runtime TSL fallback.
