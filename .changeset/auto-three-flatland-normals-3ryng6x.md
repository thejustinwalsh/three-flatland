---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/normals

**New package** — `@three-flatland/normals` is a Node-runnable offline normal-map baker and runtime loader for sprite normal maps.

### Offline baker (`flatland-bake normal`)
- Reads an RGBA PNG, computes the 4-neighbor alpha gradient, normalizes to tangent-space normals, and writes a sibling `.normal.png`
- Usage: `flatland-bake normal sprite.png` or `flatland-bake normal sprite.png out.normal.png --strength 2`
- Registers itself via the `flatland.bake` manifest so installing the package makes the `normal` subcommand appear in `flatland-bake --list` with no extra wiring
- Supports baking individual regions (sprite sheets) via `NormalSourceDescriptor`

### Runtime loader (`NormalMapLoader`)
- Implements the canonical "try baked → fall back to runtime" pattern: HEAD probes for a sibling `.normal.png`; on hit, loads as a `Texture`; on miss, falls back to the TSL `normalFromSprite` path with a dev-time warning
- Instance API (R3F `useLoader` compatible) and static API (`NormalMapLoader.load(url, opts)`) with a shared URL+descriptor-keyed cache
- `NormalMapLoader.load()` accepts an optional `NormalSourceDescriptor` to route through `resolveNormalMap` for the full fallback chain
- Cache key uses `hashDescriptor(descriptor)` so two callers passing different descriptors for the same URL get distinct entries

### `resolveNormalMap` + fallback chain
- `forceRuntime: true` skips the baked probe and goes straight to runtime bake (renamed from `skipBakedProbe` / `disableRuntimeBake`)
- Baker is lazy-loaded via dynamic `import('./bake.js')` so it's only bundled when the fallback actually fires
- Stale-sidecar detection: if the HEAD 200 response carries no `flatland` tEXt chunk (hash mismatch), a distinct "stale" warning is emitted

### `NormalMapLoaderStaticOptions` type
- `NormalMapLoader.load()` options now extend `BakedAssetLoaderOptions` as `NormalMapLoaderStaticOptions`, unifying the option type across all baked-asset loaders in the ecosystem

### Bug fixes and lint
- Type-aware lint errors fixed across `bake.node.ts` and related files (no `@ts-ignore` directives)

This release delivers the full offline-bake + runtime-loader pipeline for sprite normal maps, including descriptor-based region baking and a unified `forceRuntime` opt-out.

