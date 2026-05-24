---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Normal Map Pipeline

- New `@three-flatland/normals` package: Node-runnable offline normal-map baker and runtime loader
- `flatland-bake normal <input.png>` bakes RGBA PNG → tangent-space normal map by computing 4-neighbor alpha gradients; optional `--strength` flag; contributes to `flatland-bake --list` automatically via `flatland.bakers` manifest
- `NormalMapLoader`: canonical "try baked sidecar → runtime fallback" loader; returns `Texture | null`; accepts an optional `NormalSourceDescriptor` to use the full `resolveNormalMap` fallback chain
- Runtime in-memory bake fallback in `resolveNormalMap`: dynamic-imports the baker module (`./bake.js`, ~3 kB) only when the fallback fires, so the baker never lands in consumer bundles otherwise; exported as a `./bake` subpath
- `probeBakedSibling`: HEAD-probe + partial-range hash check for stale sidecar detection; stale sidecars trigger a dev-time warning and fall through to runtime bake
- `BakedAssetLoaderOptions` structural type shared across all baked-asset loaders (`NormalMapLoader`, `SlugFontLoader`, and the loaders in `three-flatland`)

## BREAKING CHANGES

- `skipBakedProbe` renamed to `forceRuntime` on `NormalMapLoader` and `BakedAssetLoaderOptions`
- `disableRuntimeBake` option removed; if normals are requested, the runtime bake fires unless `forceRuntime: true` is set

The package ships the complete normal-map pipeline: offline baker via `flatland-bake normal`, runtime `NormalMapLoader` with lazy in-memory fallback, and stale-sidecar detection.
