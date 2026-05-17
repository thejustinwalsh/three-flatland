---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/normals` package — offline normal-map baker and runtime `NormalMapLoader`
- `flatland-bake normal <sprite.png>` computes tangent-space normals from sprite alpha via 4-neighbor gradient and writes a sibling `.normal.png`; optional `--strength` multiplier
- `NormalMapLoader` implements the canonical try-baked → runtime-fallback pattern: HEAD-probes the `.normal.png` sidecar, loads it on hit, falls back to in-memory TSL bake with a dev-time warning
- `NormalMapLoader.load(url, { descriptor?, forceRuntime? })` — descriptor route enables the full `resolveNormalMap` fallback chain; `forceRuntime: true` skips the probe entirely
- `NormalMapLoader._cache` keyed by `hashDescriptor(descriptor)` so two callers with different descriptors for the same URL get distinct entries
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` for structural consistency across all baked-asset loaders
- `resolveNormalMap` stale-sidecar detection — warns distinctly when the sidecar exists but its embedded hash doesn't match the source
- Baker module lazy-imported (~3 kB) so it only lands in bundles when the runtime fallback actually fires

`@three-flatland/normals` integrates with `@three-flatland/bake` via the `flatland.bakers` manifest — installing the package makes `flatland-bake normal` available with no extra wiring.
