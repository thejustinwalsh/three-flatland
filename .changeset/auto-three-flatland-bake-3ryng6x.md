---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/bake` package: `flatland-bake` CLI that discovers and dispatches to bakers contributed by workspace or npm packages via `package.json` `flatland.bake` manifest
- Baker discovery walks `node_modules` upward from CWD; CWD-self-discovery lets package authors iterate without symlinking; duplicate-name conflicts reported with first-wins policy
- `flatland-bake normal <sprite.png>` subcommand (provided by `@three-flatland/normals`) bakes tangent-space normal maps from RGBA PNGs offline, avoiding per-fragment GPU cost
- Normal descriptor loader: `NormalSourceDescriptor` support in `NormalMapLoader`, `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader`; loader tries baked `.normal.png` sidecar and falls back to runtime TSL bake with a dev-time warning
- `forceRuntime: true` option replaces `skipBakedProbe`/`disableRuntimeBake` across all baked-asset loaders — one flag, one pattern (`normals: true | descriptor` to opt in, `forceRuntime: true` to skip the probe)
- Sidecar hash-staleness detection: loader warns when a baked sidecar exists but its embedded hash doesn't match the source sprite
- CLI help text updated: legacy `flatland.bakers` field deprecation warning; dead 206-guard removed from sidecar fetch; `setState` in `useFrame` deferred via `queueMicrotask`

`@three-flatland/bake` ships a pluggable build-time pipeline; `@three-flatland/normals` provides the first baker (`flatland-bake normal`) and the runtime `NormalMapLoader` with full fallback chain.
