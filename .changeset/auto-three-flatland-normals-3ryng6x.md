---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/normals

### New features

- **New package**: Node-runnable normal-map baker — reads an RGBA PNG, computes the 4-neighbor alpha gradient, normalizes to tangent-space, and writes a sibling `.normal.png`
- **`flatland-bake normal` CLI**: `flatland-bake normal sprite.png` and `flatland-bake normal sprite.png out.normal.png --strength 2`; contributes via the `flatland.bake` manifest so it appears in `--list` automatically when installed
- **`NormalMapLoader`**: runtime loader implementing the canonical try-baked-fallback pattern — HEAD-probes for the sibling `.normal.png`, loads it if present, falls back to the runtime `normalFromSprite` TSL path with a dev-time warning
  - Instance API (R3F `useLoader` compatible) and static API (`NormalMapLoader.load(url, opts)`) with a shared URL-keyed cache
  - Cache key uses `hashDescriptor(descriptor)` so two callers with different descriptors for the same URL get distinct entries
- **`NormalSourceDescriptor`**: per-region baking descriptors supported by `NormalMapLoader.load()`, routes through `resolveNormalMap` for the full fallback chain
- **`resolveNormalMap`**: full resolution chain with lazy-imported baker — the `~3kB` bake module only lands in consumer bundles when the runtime fallback actually fires
- **`forceRuntime` option**: replaces `skipBakedProbe` and `disableRuntimeBake` — one flag, one pattern across all baked-asset loaders
- **`NormalMapLoaderStaticOptions`** extends `BakedAssetLoaderOptions` — structurally aligned with every other baked-asset loader

### Bug fixes

- Resolved type-aware lint errors across devtools and loaders: unused vars/imports, `import type` conversions, `IndexedDB` rejection wrapping, `PingPayload` empty interface → `Record<string, never>`, `JSON.parse` typed as `unknown`
- Stale-hash test added: exercises the `probe.ok && !probe.hashMatches` branch (HEAD 200 + bare PNG signature with no `flatland` tEXt chunk)

This release ships `@three-flatland/normals` with offline baking via CLI, the `NormalMapLoader` runtime fallback chain, and a unified `forceRuntime` API shared across all baked-asset loaders.
