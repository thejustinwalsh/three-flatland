---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/normals` package: offline normal-map baker that reads RGBA PNG sprites, computes 4-neighbor alpha gradient normals, and writes a sibling `.normal.png`
- `flatland-bake normal <sprite.png> [output.png] [--strength N]` available automatically once the package is installed
- `NormalMapLoader`: runtime loader implementing the "try baked → fall back to runtime TSL `normalFromSprite`" pattern
  - Instance API compatible with R3F `useLoader`; static API for vanilla Three.js
  - Accepts an optional `NormalSourceDescriptor` to route through `resolveNormalMap` for the full fallback chain
  - `forceRuntime: true` skips the baked-asset probe and goes straight to runtime bake
  - Cache keyed by `hashDescriptor(descriptor)` — distinct descriptors for the same URL get separate cache entries
- Lazy-loads the baker module (`./bake.js`, ~3 KB) only when the runtime fallback actually fires
- Stale-hash detection: warns distinctly when the sidecar exists but its embedded hash doesn't match the source sprite
- Type-aware lint cleanup across the normals package

## BREAKING CHANGES

- `skipBakedProbe` renamed to `forceRuntime` on `NormalMapLoader` and `ResolveNormalMapOptions`
- `disableRuntimeBake` removed; use `forceRuntime: true` instead

Introduces `@three-flatland/normals` for offline normal-map baking and a full runtime fallback loader pipeline.
