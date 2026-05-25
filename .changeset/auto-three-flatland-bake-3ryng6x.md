---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

- New `@three-flatland/bake` package ships the `flatland-bake` CLI entry point
- Bakers are auto-discovered from `node_modules` and the CWD's own `package.json` (`flatland.bake` field), so package authors can iterate without symlinking
- Baker packages declare contributions via `{ "flatland": { "bake": [{ "name", "description", "entry" }] } }` in `package.json`; installing a package makes its subcommand appear in `flatland-bake --list` with no extra wiring
- Duplicate-name registrations reported as conflicts with first-wins policy
- Sidecar read/write utilities (`sidecar.ts`, `writeSidecar.ts`) with PNG tEXt chunk metadata for baked-asset hash tracking
- `devtimeWarn` helper for once-per-URL dev-time warnings used by loaders
- Baked-asset descriptor format and bake-script support for per-region normal baking

## Breaking Changes

- `BakedAssetLoaderOptions.skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` option removed — runtime bake is always the fallback when normals are requested

## Bug Fixes

- Fixed CLI help text that referenced legacy `flatland.bakers` field (canonical field is `flatland.bake`)
- Removed dead `&& header.status !== 206` guard in `sidecar.ts` (`Response.ok` already covers 200–299)
- Fixed React example calling `setTorchEnabled` inside `useFrame`; now deferred via `queueMicrotask` to avoid mid-frame re-renders

The `@three-flatland/bake` package ships the `flatland-bake` CLI and a plugin-discovery system. Install `@three-flatland/normals` to enable `flatland-bake normal` for offline sprite normal-map baking.
