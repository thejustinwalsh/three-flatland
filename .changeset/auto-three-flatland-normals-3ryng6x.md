---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**New package: `@three-flatland/normals`**
- `flatland-bake normal <sprite.png>` — Node-runnable baker that reads an RGBA PNG, computes a 4-neighbor alpha gradient, normalises to a tangent-space normal map, and writes a sibling `.normal.png`; optional `--strength` multiplier
- Contributes a `flatland.bake` manifest entry so installing the package automatically registers the `normal` subcommand in `flatland-bake`

**`NormalMapLoader`**
- Runtime loader implementing the canonical "try baked → runtime fallback" pattern
- Instance API (R3F `useLoader` compatible, extends `three.Loader`) and static API (`NormalMapLoader.load(url, opts)`) with a shared URL+descriptor-keyed cache
- Accepts an optional `NormalSourceDescriptor`; with one, routes through `resolveNormalMap` for the full fallback chain; without one, preserves legacy URL-only behaviour (silent 404 probe → `null` on miss)
- `forceRuntime: true` skips the baked-asset probe and goes straight to in-memory bake
- Cache key now uses `hashDescriptor(descriptor)` instead of presence-only; two callers passing different descriptors for the same URL receive distinct cache entries
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` — structurally unified with all other baked-asset loader option types

**`resolveNormalMap`**
- Runtime fallback bake is now a dynamic import of `./bake.js` (~3 kB) so the baker only lands in consumer bundles when the fallback actually fires
- `disableRuntimeBake` flag (later renamed to `forceRuntime`): when true, a missing sidecar resolves to a 1×1 flat `DataTexture` instead of triggering a CPU bake — use in production where every sidecar should ship
- Full fallback chain: probe baked sibling → runtime in-memory bake → flat fallback; devtime warning at each fallback step (suppressed in production)

**API changes**
- `skipBakedProbe` renamed to `forceRuntime` across `NormalMapLoader`, `resolveNormalMap`, `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`
- `disableRuntimeBake` removed; `forceRuntime: true` now covers both opt-outs (probe skip and runtime bake skip)

**Bug fixes**
- Stale-hash detection: `probe.ok && !probe.hashMatches` path correctly warns and re-bakes when a sidecar exists but its embedded hash doesn't match the source

## BREAKING CHANGES

- `skipBakedProbe` → `forceRuntime` in all loader options; `disableRuntimeBake` removed — use `forceRuntime: true` for both behaviours

Introduces `@three-flatland/normals` with an offline normal-map baker CLI and a runtime `NormalMapLoader` implementing the canonical baked-asset loader pattern across the ecosystem.
